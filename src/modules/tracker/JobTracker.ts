import * as crypto from 'node:crypto';
import { JobPost, TrackedJobRecord, ApplicationStatus, FilterResult, TailoredResume } from '../../types/index.js';
import { readJson, writeJson } from '../../storage/index.js';

export class JobTracker {
  private dbKey: string;
  private records: Map<string, TrackedJobRecord> = new Map();
  private ready: Promise<void>;

  constructor(dbKey: string = 'data/db/jobs_pipeline.json') {
    this.dbKey = dbKey;
    this.ready = this.load();
  }

  /** 确保底层存储已加载完成（云端首次调用时等待） */
  public async ensureReady(): Promise<void> {
    await this.ready;
  }

  /**
   * 强制从存储层重载最新数据（丢弃本实例内存快照）。
   * 云端多实例并发时防"旧快照整体覆盖新结果"：关键写操作（批量重筛/采集批处理）前必须调用。
   */
  public async reload(): Promise<void> {
    await this.ready;
    await this.load();
  }

  private async load(): Promise<void> {
    const list = await readJson<TrackedJobRecord[]>(this.dbKey, []);
    this.records = new Map(list.map(r => [r.job.id, r]));
  }

  /**
   * 生成职位唯一指纹哈希
   * URL 做归一化（剔除 query 参数与 fragment、统一小写主机、去尾斜杠）：
   * 同一岗位从列表页卡片抓取（可能带 ?lid=xxx 等追踪参数）与从详情页抓取，产出相同指纹，防止重复入库。
   */
  public generateFingerprint(company: string, title: string, platformIdOrUrl: string): string {
    const cleanCompany = company.trim().toLowerCase().replace(/[\(（].*?[\)）]/g, '');
    const cleanTitle = title.trim().toLowerCase().replace(/\s+/g, '');
    const cleanUrl = this.normalizeUrl(platformIdOrUrl);
    const raw = `${cleanCompany}_${cleanTitle}_${cleanUrl}`;
    return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
  }

  /** URL 归一化：剔除 ?query 与 #fragment，小写主机名，去尾部斜杠 */
  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url.trim());
      return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      // 非 URL（平台 ID 等）按原样处理
      return url.trim().replace(/[?#].*$/, '');
    }
  }

  /**
   * 检查岗位是否已经被处理过（已在库中）
   */
  public isAlreadyProcessed(fingerprint: string): boolean {
    return this.records.has(fingerprint);
  }

  /**
   * 检查公司冷却期（例如：同一家公司在 pastDays 天内是否投递过）
   */
  public isCompanyInCooldown(company: string, cooldownDays: number = 30): { inCooldown: boolean; lastApplied?: string } {
    const cleanCompany = company.trim().toLowerCase();
    const now = Date.now();
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

    for (const record of this.records.values()) {
      const recCompany = record.job.company.trim().toLowerCase();
      if (recCompany.includes(cleanCompany) || cleanCompany.includes(recCompany)) {
        if (['APPROVED', 'APPLIED', 'COMMUNICATING', 'INTERVIEWING'].includes(record.status)) {
          const applyTime = new Date(record.lastUpdated).getTime();
          if (now - applyTime < cooldownMs) {
            return { inCooldown: true, lastApplied: record.lastUpdated };
          }
        }
      }
    }
    return { inCooldown: false };
  }

  /**
   * 新增发现岗位
   */
  public registerDiscoveredJob(job: JobPost): TrackedJobRecord {
    if (!job.id) {
      job.id = this.generateFingerprint(job.company, job.title, job.url);
    }

    if (this.records.has(job.id)) {
      return this.records.get(job.id)!;
    }

    const record: TrackedJobRecord = {
      job,
      status: 'DISCOVERED',
      statusHistory: [
        {
          status: 'DISCOVERED',
          timestamp: new Date().toISOString(),
          note: `首次发现职位 [${job.company}] ${job.title} 来自 ${job.platform}`
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    this.records.set(job.id, record);
    void this.save();
    return record;
  }

  /**
   * 更新岗位状态及附加数据
   */
  public updateStatus(
    jobId: string,
    status: ApplicationStatus,
    note?: string,
    extra?: {
      filterResult?: FilterResult;
      tailoredResume?: TailoredResume;
      userFeedback?: TrackedJobRecord['userFeedback'];
    }
  ): TrackedJobRecord | null {
    const record = this.records.get(jobId);
    if (!record) return null;

    record.status = status;
    record.lastUpdated = new Date().toISOString();
    record.statusHistory.push({
      status,
      timestamp: record.lastUpdated,
      note
    });

    if (extra?.filterResult) record.filterResult = extra.filterResult;
    if (extra?.tailoredResume) record.tailoredResume = extra.tailoredResume;
    if (extra?.userFeedback) record.userFeedback = extra.userFeedback;

    this.records.set(jobId, record);
    this.save();
    return record;
  }

  public getRecord(jobId: string): TrackedJobRecord | undefined {
    return this.records.get(jobId);
  }

  public getAllRecords(): TrackedJobRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * 获取进度看板统计数据
   */
  public getPipelineStatistics() {
    const stats: Record<ApplicationStatus, number> = {
      DISCOVERED: 0,
      FILTERED_OUT: 0,
      PENDING_REVIEW: 0,
      REJECTED_BY_USER: 0,
      APPROVED: 0,
      APPLIED: 0,
      COMMUNICATING: 0,
      INTERVIEWING: 0,
      OFFER: 0,
      ARCHIVED: 0
    };

    for (const rec of this.records.values()) {
      if (stats[rec.status] !== undefined) {
        stats[rec.status]++;
      }
    }

    return {
      total: this.records.size,
      byStatus: stats
    };
  }

  private async save(): Promise<void> {
    try {
      await writeJson(this.dbKey, Array.from(this.records.values()));
    } catch (e) {
      console.error(`[JobTracker] 保存数据失败:`, e);
    }
  }
}
