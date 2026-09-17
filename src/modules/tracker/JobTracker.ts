import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { JobPost, TrackedJobRecord, ApplicationStatus, FilterResult, TailoredResume } from '../../types/index.js';

export class JobTracker {
  private dbPath: string;
  private records: Map<string, TrackedJobRecord> = new Map();

  constructor(dbPath: string = path.resolve(process.cwd(), 'data/db/jobs_pipeline.json')) {
    this.dbPath = dbPath;
    this.load();
  }

  /**
   * 生成职位唯一指纹哈希
   */
  public generateFingerprint(company: string, title: string, platformIdOrUrl: string): string {
    const cleanCompany = company.trim().toLowerCase().replace(/[\(（].*?[\)）]/g, '');
    const cleanTitle = title.trim().toLowerCase().replace(/\s+/g, '');
    const raw = `${cleanCompany}_${cleanTitle}_${platformIdOrUrl.trim()}`;
    return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
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
    this.save();
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

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const list: TrackedJobRecord[] = JSON.parse(raw);
        for (const item of list) {
          this.records.set(item.job.id, item);
        }
      }
    } catch (e) {
      console.error(`[JobTracker] 加载数据失败:`, e);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.records.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[JobTracker] 保存数据失败:`, e);
    }
  }
}
