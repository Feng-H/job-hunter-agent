import 'dotenv/config';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobHunterCore } from './index.js';
import { JobPost } from './types/index.js';
import { AntiRiskEngine } from './modules/safety/AntiRiskEngine.js';

const execAsync = promisify(exec);

export class StandaloneJobHunter {
  private agent: JobHunterCore;
  private safety: AntiRiskEngine;

  constructor() {
    this.agent = new JobHunterCore();
    this.safety = new AntiRiskEngine();
  }

  /**
   * 通过 macOS 系统底层 JXA 接口从 Chrome 纯只读提取（带全套防风控护盾）
   */
  public async extractFromChrome(): Promise<JobPost[]> {
    // 1. 检查熔断状态
    const breaker = this.safety.isCircuitBreakerTripped();
    if (breaker.tripped) {
      console.warn(`🛡️ [安全熔断拦截] 当前处于休眠保护期（原因：${breaker.reason}），已暂停对前台浏览器的读取！`);
      return [];
    }

    const jxaScriptPath = path.resolve(process.cwd(), 'scripts/extract-jxa.js');
    if (!fs.existsSync(jxaScriptPath)) {
      return [];
    }

    try {
      // 拟人化微延迟
      await this.safety.humanJitterDelay(1500, 3000);

      const { stdout } = await execAsync(`osascript -l JavaScript "${jxaScriptPath}"`);
      const parsed = JSON.parse(stdout.trim() || '{}');

      // 2. 检测到风控特征，立即触发主动熔断
      if (parsed.riskDetected) {
        this.safety.tripCircuitBreaker(`页面出现风控特征关键字: ${parsed.reason}`);
        // 向飞书推送警报
        await (this.agent as any).feishu.sendApprovalNotification(
          {
            id: 'risk_alert_' + Date.now(),
            title: '⚠️ 账号安全保护已触发熔断',
            company: '系统安全盾牌',
            city: '本地防护',
            workMode: 'ONSITE',
            salaryText: '休眠保护中',
            description: `检测到前台页面出现风控特征（${parsed.reason}）。系统已自动停止一切读取行为，保护您的账号不受任何限制！`,
            url: 'https://open.feishu.cn',
            platform: 'OTHER',
            discoveredAt: new Date().toISOString()
          },
          { passed: true, score: 100, reasons: [`安全熔断原因：${parsed.reason}`], breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 } },
          { jobId: 'risk_alert', company: '系统安全', jobTitle: '安全保护', generatedAt: new Date().toISOString(), markdownContent: '# 安全熔断已激活', greetingMessage: '系统已自动休眠，请放心。', keyMatchingPoints: ['账号零风险保障'] }
        );
        return [];
      }

      const rawList = parsed.jobs || [];
      const jobs: JobPost[] = [];

      for (const item of rawList) {
        if (!item.title || !item.url) continue;

        // 3. 每日安全配额检查
        const platform = item.url.includes('zhipin') ? 'BOSS' : (item.url.includes('liepin') ? 'LIEPIN' : 'ZHAOPIN');
        if (!this.safety.checkQuota(platform)) {
          console.log(`⏳ [配额保护] 平台 ${platform} 今日已达安全上限（${AntiRiskEngine.MAX_DAILY_PER_PLATFORM}个），自动跳过。`);
          continue;
        }

        const fullUrl = item.url.startsWith('http') ? item.url : `https://www.liepin.com${item.url}`;
        const isRemote = item.city.includes('远程') || item.title.includes('远程');

        jobs.push({
          id: `lp_${Buffer.from(fullUrl).toString('base64').substring(0, 16)}`,
          title: item.title,
          company: item.company || '知名企业/猎头直聘',
          city: item.city || '长沙',
          workMode: isRemote ? 'REMOTE' : 'ONSITE',
          salaryText: item.salaryText || '面议',
          description: `${item.title}。${item.rawText || ''}`,
          url: fullUrl,
          platform,
          publishOrActiveTime: item.activeTime || '近期在线',
          discoveredAt: new Date().toISOString()
        });

        this.safety.recordUsage(platform);
      }

      return jobs;
    } catch (e: any) {
      console.warn(`[macOS JXA] 只读提取异常: ${e.message}`);
      return [];
    }
  }

  /**
   * 执行单次全自动扫描与推送
   */
  public async runSingleScan(): Promise<number> {
    console.log(`\n======================================================`);
    console.log(`🕒 [Job-Hunter] 启动系统扫描: ${new Date().toLocaleString()}`);
    console.log(`======================================================`);

    // 1. 从 Chrome 提取
    const jobs = await this.extractFromChrome();
    console.log(`📌 从当前 Chrome 招聘窗口捕获到 ${jobs.length} 个结构化岗位候选`);

    let approvedCount = 0;
    for (const job of jobs) {
      const res = await this.agent.processSingleJob(job);
      if (res.approved) {
        approvedCount++;
      }
    }

    console.log(`\n🎉 本次扫描完成！共推送了 ${approvedCount} 个高匹配度岗位至飞书。`);
    return approvedCount;
  }

  /**
   * 启动后台持续轮询巡检模式（Daemon Watcher）
   */
  public async startWatcher(intervalMinutes: number = 15): Promise<void> {
    console.log(`🚀 [Job-Hunter] 独立守护进程已启动！`);
    console.log(`⏰ 巡检周期：每 ${intervalMinutes} 分钟自动同步一次当前浏览器岗位`);
    console.log(`💡 提示：按 Ctrl+C 可随时停止运行。\n`);

    // 首次立即执行
    await this.runSingleScan();

    // 定时轮询
    setInterval(async () => {
      try {
        await this.runSingleScan();
      } catch (e) {
        console.error('巡检出错:', e);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * 打印当前投递与跟踪进度看板
   */
  public showPipelineStatus(): void {
    const stats = (this.agent as any).tracker.getPipelineStatistics();
    console.log('\n📊 ========== Job-Hunter 职位生命周期跟踪看板 ==========');
    console.log(`总收录岗位数: ${stats.total}`);
    console.log(`  - 待您飞书审批 (PENDING_REVIEW):   ${stats.byStatus.PENDING_REVIEW}`);
    console.log(`  - 已确认同意投递 (APPROVED):       ${stats.byStatus.APPROVED}`);
    console.log(`  - 已执行投递/打招呼 (APPLIED):     ${stats.byStatus.APPLIED}`);
    console.log(`  - 规则与红线过滤淘汰 (FILTERED_OUT):${stats.byStatus.FILTERED_OUT}`);
    console.log(`  - 您主动拒绝记录 (REJECTED_BY_USER):${stats.byStatus.REJECTED_BY_USER}`);
    console.log('========================================================\n');
  }
}

// 命令行参数路由
const command = process.argv[2] || 'scan';
const hunter = new StandaloneJobHunter();

switch (command) {
  case 'scan':
    hunter.runSingleScan().catch(console.error);
    break;
  case 'watch':
    const mins = parseInt(process.argv[3] || '15', 10);
    hunter.startWatcher(mins).catch(console.error);
    break;
  case 'status':
    hunter.showPipelineStatus();
    break;
  default:
    console.log(`用法:
  tsx src/standalone.ts scan     # 执行单次极速扫描并推飞书
  tsx src/standalone.ts watch 15 # 启动守护进程，每15分钟轮询巡检
  tsx src/standalone.ts status   # 查看求职看板进度统计`);
    break;
}
