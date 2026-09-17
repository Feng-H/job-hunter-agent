import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJson, writeJson } from '../../storage/index.js';

export interface AntiRiskState {
  circuitBreakerTripped: boolean; // 是否触发熔断休眠
  trippedReason?: string;
  trippedAt?: string;
  dailyCount: Record<string, number>; // 各平台今日处理次数 { BOSS: 0, LIEPIN: 5 }
  currentDate: string; // YYYY-MM-DD
}

export class AntiRiskEngine {
  private stateKey: string;
  private state: AntiRiskState;

  // 安全配置硬约束
  public static readonly MAX_DAILY_PER_PLATFORM = 20; // 单平台每日上限20个，杜绝高频
  public static readonly MIN_HUMAN_DELAY_MS = 3500;  // 拟人化最小操作延迟 3.5s
  public static readonly MAX_HUMAN_DELAY_MS = 7500;  // 拟人化最大操作延迟 7.5s

  constructor(fileKey: string = 'data/memory/anti_risk_state.json') {
    this.stateKey = fileKey;
    this.state = this.loadState();
    this.checkAndResetDailyQuota();
  }

  /**
   * 检查是否处于安全熔断状态
   */
  public isCircuitBreakerTripped(): { tripped: boolean; reason?: string } {
    if (this.state.circuitBreakerTripped) {
      return { tripped: true, reason: this.state.trippedReason };
    }
    return { tripped: false };
  }

  /**
   * 触发安全熔断（主动休眠保护账号）
   */
  public tripCircuitBreaker(reason: string): void {
    this.state.circuitBreakerTripped = true;
    this.state.trippedReason = reason;
    this.state.trippedAt = new Date().toISOString();
    this.saveState();
    console.error(`\n🚨🚨🚨 [风控熔断触发] ${reason} 🚨🚨🚨`);
    console.error(`🛡️ 自动化扫描与打招呼已紧急挂起，保护账号不被风控！`);
    console.error(`👉 请排查招聘平台验证码或风控提示后，在看板手动解除熔断。\n`);
  }

  /**
   * 人工复位熔断
   */
  public resetCircuitBreaker(): void {
    this.state.circuitBreakerTripped = false;
    this.state.trippedReason = undefined;
    this.state.trippedAt = undefined;
    this.saveState();
    console.log(`✅ [AntiRiskEngine] 风控熔断已手动复位恢复正常！`);
  }

  /**
   * 检查指定平台今日是否已触碰保护上限
   */
  public canProcess(platform: string): { allowed: boolean; reason?: string } {
    this.checkAndResetDailyQuota();

    if (this.state.circuitBreakerTripped) {
      return { allowed: false, reason: `风控熔断中: ${this.state.trippedReason}` };
    }

    const currentCount = this.state.dailyCount[platform] || 0;
    if (currentCount >= AntiRiskEngine.MAX_DAILY_PER_PLATFORM) {
      return {
        allowed: false,
        reason: `已达单平台每日安全处理阈值 (${AntiRiskEngine.MAX_DAILY_PER_PLATFORM}个/日)，主动停手防风控`
      };
    }

    return { allowed: true };
  }

  public checkQuota(platform: string): boolean {
    return this.canProcess(platform).allowed;
  }

  /**
   * 记录一次有效投递/打招呼操作
   */
  public recordAction(platform: string): void {
    this.checkAndResetDailyQuota();
    this.state.dailyCount[platform] = (this.state.dailyCount[platform] || 0) + 1;
    this.saveState();
  }

  public recordUsage(platform: string): void {
    this.recordAction(platform);
  }

  public async humanJitterDelay(minMs: number = AntiRiskEngine.MIN_HUMAN_DELAY_MS, maxMs: number = AntiRiskEngine.MAX_HUMAN_DELAY_MS): Promise<number> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * 拟人化随机延迟等待（模拟真人浏览与停顿）
   */
  public async humanRandomWait(actionName: string = '操作'): Promise<number> {
    const delay = Math.floor(
      Math.random() * (AntiRiskEngine.MAX_HUMAN_DELAY_MS - AntiRiskEngine.MIN_HUMAN_DELAY_MS + 1) +
      AntiRiskEngine.MIN_HUMAN_DELAY_MS
    );
    console.log(`⏳ [防风控拟人延时] 执行【${actionName}】前随机静默 ${(delay / 1000).toFixed(1)} 秒...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * 扫描 HTML/文本中是否含有平台验证码、滑块或风险风控标志
   */
  public detectRiskInHtml(html: string): { hasRisk: boolean; signature?: string } {
    const lower = (html || '').toLowerCase();

    const dangerSignatures = [
      { pattern: 'sec.zhipin.com', reason: 'Boss直聘安全验证拦截' },
      { pattern: 'waf_verify', reason: '触发底层 WAF 滑块' },
      { pattern: 'geetest', reason: '极验验证码弹出' },
      { pattern: '验证码', reason: '检测到页面包含验证码提示' },
      { pattern: '频繁', reason: '操作过于频繁提示' },
      { pattern: '异常访问', reason: '检测到异常访问警告' },
      { pattern: 'acw_sc_v2', reason: '阿里云WAF挑战盾牌触发' }
    ];

    for (const sig of dangerSignatures) {
      if (lower.includes(sig.pattern.toLowerCase())) {
        return { hasRisk: true, signature: sig.reason };
      }
    }

    return { hasRisk: false };
  }

  public getState(): AntiRiskState {
    return { ...this.state };
  }

  private checkAndResetDailyQuota(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.state.currentDate !== today) {
      this.state.currentDate = today;
      this.state.dailyCount = {};
      this.saveState();
    }
  }

  private loadState(): AntiRiskState {
    try {
      const absPath = path.resolve(process.cwd(), this.stateKey);
      if (fs.existsSync(absPath)) {
        return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
      }
    } catch (e) {}
    return {
      circuitBreakerTripped: false,
      dailyCount: {},
      currentDate: new Date().toISOString().split('T')[0]
    };
  }

  private saveState(): void {
    void writeJson(this.stateKey, this.state);
  }
}
