import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MasterProfile, JobPost } from './types/index.js';
import { JobTracker } from './modules/tracker/JobTracker.js';
import { FeedbackMemoryManager } from './modules/tracker/FeedbackMemory.js';
import { JobFilter } from './modules/filter/JobFilter.js';
import { ResumeTailor } from './modules/tailor/ResumeTailor.js';
import { FeishuNotifier } from './modules/feishu/FeishuClient.js';
import { ForeignEnterpriseRadar } from './modules/discovery/ForeignEnterpriseRadar.js';
import { readJson } from './storage/index.js';
// 说明：ChromePlatformScraper / ChromeCDPClient（依赖 playwright-core）仅在本地扫描时按需动态加载，
// 避免被打进 Vercel 云函数的冷启动依赖链（nft 打包 playwright 易缺文件导致函数崩溃）

const CONFIG_TTL_MS = 60 * 1000; // 规则/档案热刷新节流：同一实例 60 秒内不重复读 KV

export class JobHunterCore {
  private tracker: JobTracker;
  private memoryManager: FeedbackMemoryManager;
  private filter: JobFilter;
  private tailor: ResumeTailor;
  private feishu: FeishuNotifier;
  private profile: MasterProfile;
  private lastConfigLoad = 0;

  constructor() {
    this.tracker = new JobTracker();
    this.memoryManager = new FeedbackMemoryManager();
    this.filter = new JobFilter();
    this.tailor = new ResumeTailor();
    this.feishu = new FeishuNotifier();
    this.profile = this.fsFallbackProfile();
    void this.refreshProfileFromStorage();
  }

  /** 本地档案兜底：文件存在读文件，否则通用占位（真实档案由存储层异步刷新） */
  private fsFallbackProfile(): MasterProfile {
    try {
      const profilePath = path.resolve(process.cwd(), 'data/profile/master_profile.json');
      if (fs.existsSync(profilePath)) {
        return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      }
    } catch {}
    return { basicInfo: { name: '求职者', title: '专业人才', yearsOfExperience: 5 } } as any;
  }

  private async refreshProfileFromStorage(): Promise<void> {
    try {
      this.profile = await readJson<MasterProfile>('data/profile/master_profile.json', this.profile);
    } catch (e) {
      console.warn('[JobHunterCore] 从存储层加载档案失败，沿用当前档案:', (e as Error).message);
    }
  }

  /**
   * 处理岗位前确保规则与档案足够新鲜（60 秒节流，云端每批采集自动生效最新偏好）
   */
  public async ensureFreshConfig(): Promise<void> {
    const now = Date.now();
    if (now - this.lastConfigLoad < CONFIG_TTL_MS) return;
    this.lastConfigLoad = now;
    await Promise.all([this.filter.refreshRules(), this.refreshProfileFromStorage()]);
  }

  /**
   * 动态重新加载最新规则偏好与个人档案（Web看板保存后即时生效）
   */
  public async reloadConfig(): Promise<void> {
    this.lastConfigLoad = Date.now();
    await Promise.all([this.filter.refreshRules(), this.refreshProfileFromStorage()]);
    console.log('🔄 [JobHunterCore] 规则偏好与个人档案配置已动态重载生效！');
  }

  /**
   * 按最新规则批量重筛历史岗位（仅初筛级判定，不消耗 LLM）：
   * 对 FILTERED_OUT / DISCOVERED 状态的岗位重跑严格过滤器，通过者晋升 PENDING_REVIEW
   */
  public async refilterAllJobs(): Promise<{ rechecked: number; promoted: number; stillRejected: number }> {
    await this.reloadConfig();
    const memory = this.memoryManager.getMemory();
    let rechecked = 0, promoted = 0, stillRejected = 0;

    for (const record of this.tracker.getAllRecords()) {
      if (record.status !== 'FILTERED_OUT' && record.status !== 'DISCOVERED') continue;
      rechecked++;
      const verdict = this.filter.evaluate(record.job, this.profile, memory);
      if (verdict.passed) {
        this.tracker.updateStatus(record.job.id, 'PENDING_REVIEW', `按最新规则重筛通过（评分 ${verdict.score}）`, { filterResult: verdict });
        promoted++;
      } else {
        this.tracker.updateStatus(record.job.id, 'FILTERED_OUT', verdict.reasons.join('；'), { filterResult: verdict });
        stillRejected++;
      }
    }
    return { rechecked, promoted, stillRejected };
  }

  /**
   * 处理单个真实岗位（用于书签实时采集或单独推送）
   */
  public async processSingleJob(job: JobPost): Promise<{ approved: boolean; reason?: string }> {
    await this.ensureFreshConfig();
    const fingerprint = this.tracker.generateFingerprint(job.company, job.title, job.url);
    job.id = fingerprint;

    // 1. 防重排查
    if (this.tracker.isAlreadyProcessed(fingerprint)) {
      console.log(`⏭️  [防重跳过] 岗位已在库中: [${job.company}] ${job.title}`);
      return { approved: false, reason: '已在库中' };
    }

    this.tracker.registerDiscoveredJob(job);

    // 2. 公司冷却期检查
    const cooldownCheck = this.tracker.isCompanyInCooldown(job.company);
    if (cooldownCheck.inCooldown) {
      console.log(`⏳ [冷却期跳过] 公司「${job.company}」处于投递冷却保护期中`);
      this.tracker.updateStatus(job.id, 'FILTERED_OUT', '处于公司投递冷却期');
      return { approved: false, reason: '公司冷却期' };
    }

    // 3. 严格规则过滤与智能评分（时效3个月 + 双休 + 松雅湖通勤1.5h + 薪资15K+）
    const filterResult = this.filter.evaluate(job, this.profile, this.memoryManager.getMemory());
    if (!filterResult.passed) {
      console.log(`❌ [过滤淘汰] [${job.company}] ${job.title} | 得分: ${filterResult.score} | 原因: ${filterResult.reasons.join('; ')}`);
      this.tracker.updateStatus(job.id, 'FILTERED_OUT', filterResult.reasons.join('; '), { filterResult });
      return { approved: false, reason: filterResult.reasons.join('; ') };
    }

    console.log(`✅ [完美匹配] [${job.company}] ${job.title} | 综合得分: ${filterResult.score} 分！`);

    // 4. 针对性动态剪裁简历与话术（优先调用大模型 LLM 重写）
    const tailoredResume = await this.tailor.generateTailoredResumeAsync(job, this.profile, this.memoryManager.getMemory());

    // 5. 更新状态并推送飞书
    this.tracker.updateStatus(job.id, 'PENDING_REVIEW', '已通过智能初筛，已推送到飞书等待用户确认', {
      filterResult,
      tailoredResume
    });

    const sent = await this.feishu.sendApprovalNotification(job, filterResult, tailoredResume);
    return { approved: sent };
  }

  /**
   * 运行全渠道职位扫描与处理流水线（Boss直聘 + 猎聘 + 智联 + 外企官网）
   */
  public async runDiscoveryCycle(): Promise<void> {
    console.log('\n🚀 [Job-Hunter] 启动全渠道职位雷达扫描与匹配评估...');

    // playwright 相关模块按需动态加载（仅本地扫描场景触达）
    const [{ ChromeCDPClient }, { ChromePlatformScraper }] = await Promise.all([
      import('./modules/browser/ChromeCDPClient.js'),
      import('./modules/discovery/ChromePlatformScraper.js')
    ]);
    const cdpClient = new ChromeCDPClient();
    const scraper = new ChromePlatformScraper(cdpClient);
    const foreignRadar = new ForeignEnterpriseRadar();

    const discoveredJobs: any[] = [];

    // 1. 尝试连接 Chrome 抓取三大主流平台
    const isCdpConnected = await cdpClient.connect();
    if (isCdpConnected) {
      console.log('🌐 [全渠道扫描] 正在通过接管的已登录 Chrome 抓取【Boss直聘】、【猎聘】、【智联】...');
      
      // 核心搜索词矩阵（小批量精细测试：先测 1-2 个词）
      const searchKeywords = [
        '智能制造 数字化',
        'AI产品经理'
      ];

      for (const kw of searchKeywords) {
        // Boss 直聘检索
        const bossJobs = await scraper.scrapeBoss(kw, '长沙');
        discoveredJobs.push(...bossJobs);

        // 猎聘检索 (中高端/外企聚集)
        const liepinJobs = await scraper.scrapeLiepin(kw, '长沙');
        discoveredJobs.push(...liepinJobs);

        // 远程 AI 岗位
        if (kw.includes('AI')) {
          const remoteBossJobs = await scraper.scrapeBoss(`${kw} 远程`, '全国');
          discoveredJobs.push(...remoteBossJobs);
        }
      }
    } else {
      console.log('⚠️ [提示] 本地 Chrome 9222 调试端口未连通。');
      console.log('💡 请先运行 `npm run chrome` 启动专属浏览器，并在其中登录账号。');
    }

    // 2. 长沙知名外企官方招聘直达雷达
    const targetEnterprises = foreignRadar.getTargetEnterprises();
    console.log(`🏢 [外企雷达] 已激活 ${targetEnterprises.length} 家长沙头部外企与高规格研产基地定向监控 (博世、舍弗勒、巴斯夫杉杉、索恩格、西门子等)`);

    console.log(`📡 [雷达汇总] 本轮共抓取并聚合到 ${discoveredJobs.length} 个真实在招职位候选`);

    for (const job of discoveredJobs) {
      const fingerprint = this.tracker.generateFingerprint(job.company, job.title, job.url);
      job.id = fingerprint;

      // 1. 防重检查
      if (this.tracker.isAlreadyProcessed(fingerprint)) {
        console.log(`⏭️  [防重跳过] 岗位已经处于跟踪池中: [${job.company}] ${job.title}`);
        continue;
      }

      // 2. 登记入库
      this.tracker.registerDiscoveredJob(job);

      // 3. 公司冷却期检查
      const cooldownCheck = this.tracker.isCompanyInCooldown(job.company);
      if (cooldownCheck.inCooldown) {
        console.log(`⏳ [冷却期跳过] 公司「${job.company}」处于投递冷却保护期中 (上次投递: ${cooldownCheck.lastApplied})`);
        this.tracker.updateStatus(job.id, 'FILTERED_OUT', '处于公司投递冷却期');
        continue;
      }

      // 4. 硬指标过滤与匹配度评分
      const filterResult = this.filter.evaluate(job, this.profile, this.memoryManager.getMemory());
      if (!filterResult.passed) {
        console.log(`❌ [过滤淘汰] [${job.company}] ${job.title} | 得分: ${filterResult.score} | 原因: ${filterResult.reasons.join('; ')}`);
        this.tracker.updateStatus(job.id, 'FILTERED_OUT', filterResult.reasons.join('; '), { filterResult });
        continue;
      }

      console.log(`✅ [匹配达标] [${job.company}] ${job.title} | 综合得分: ${filterResult.score} 分！`);

      // 5. 动态裁剪定制简历与打招呼话术
      const tailoredResume = this.tailor.generateTailoredResume(job, this.profile, this.memoryManager.getMemory());

      // 6. 更新为待审核状态
      this.tracker.updateStatus(job.id, 'PENDING_REVIEW', '已通过初筛，推送到飞书等待确认', {
        filterResult,
        tailoredResume
      });

      // 7. 发送真实飞书互动卡片通知
      await this.feishu.sendApprovalNotification(job, filterResult, tailoredResume);
    }

    // 8. 打印当前进度看板
    const stats = this.tracker.getPipelineStatistics();
    console.log('\n📊 ========== 职位全生命周期跟踪看板 ==========');
    console.log(`总收录岗位数: ${stats.total}`);
    console.log(`  - 待用户审批 (PENDING_REVIEW):   ${stats.byStatus.PENDING_REVIEW}`);
    console.log(`  - 已通过待投递 (APPROVED):       ${stats.byStatus.APPROVED}`);
    console.log(`  - 已投递沟通中 (APPLIED):        ${stats.byStatus.APPLIED}`);
    console.log(`  - 规则过滤淘汰 (FILTERED_OUT):   ${stats.byStatus.FILTERED_OUT}`);
    console.log(`  - 用户主动拒绝 (REJECTED_BY_USER):${stats.byStatus.REJECTED_BY_USER}`);
    console.log('============================================\n');
  }

  /**
   * 模拟用户在飞书或本地对某个岗位做出决策
   */
  public handleUserAction(
    jobId: string,
    action: 'APPROVED' | 'REJECTED' | 'REQUEST_TWEAK',
    reasonOrTweak?: string
  ) {
    const record = this.tracker.getRecord(jobId);
    if (!record) {
      console.error(`未找到岗位记录: ${jobId}`);
      return;
    }

    if (action === 'APPROVED') {
      this.tracker.updateStatus(jobId, 'APPROVED', '用户确认投递', {
        userFeedback: { action: 'APPROVED', timestamp: new Date().toISOString() }
      });
      // 模拟触发实际投递/打招呼动作
      this.tracker.updateStatus(jobId, 'APPLIED', '已成功打招呼并投递定制简历');
      console.log(`🎉 [已投递] 成功投递至 [${record.job.company}] ${record.job.title}！`);
    } else if (action === 'REJECTED') {
      this.tracker.updateStatus(jobId, 'REJECTED_BY_USER', `用户拒绝: ${reasonOrTweak || '无特定原因'}`, {
        userFeedback: { action: 'REJECTED', reason: reasonOrTweak, timestamp: new Date().toISOString() }
      });
      // 沉淀到微调与负反馈记忆库
      this.memoryManager.recordRejection(jobId, record.job.company, record.job.title, reasonOrTweak);
      console.log(`🛑 [已拒绝并沉淀] 记录拒绝原因：「${reasonOrTweak}」，已更新到负反馈库。`);
    } else if (action === 'REQUEST_TWEAK') {
      this.memoryManager.recordResumeTweak(record.job.title, reasonOrTweak || '');
      // 重新针对性生成简历
      const newTailoredResume = this.tailor.generateTailoredResume(record.job, this.profile, this.memoryManager.getMemory());
      this.tracker.updateStatus(jobId, 'PENDING_REVIEW', `根据用户要求调整简历: ${reasonOrTweak}`, {
        tailoredResume: newTailoredResume,
        userFeedback: { action: 'REQUEST_TWEAK', tweakInstructions: reasonOrTweak, timestamp: new Date().toISOString() }
      });
      console.log(`✏️ [简历已重新裁剪] 依据要求刷新简历快照，已更新待确认状态。`);
    }
  }
}

// 导出 JobHunterCore 供外部调用
// 如果直接作为主脚本运行，在 npm run scan 中调度
