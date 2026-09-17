import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AntiRiskState {
  circuitBreakerTripped: boolean; // 是否触发熔断休眠
  trippedReason?: string;
  trippedAt?: string;
  dailyCount: Record<string, number>; // 各平台今日处理次数 { BOSS: 0, LIEPIN: 5 }
  currentDate: string; // YYYY-MM-DD
}

export class AntiRiskEngine {
  private stateFilePath: string;
  private state: AntiRiskState;

  // 安全配置硬约束
  public static readonly MAX_DAILY_PER_PLATFORM = 20; // 单平台每日上限20个，杜绝高频
  public static readonly MIN_HUMAN_DELAY_MS = 3500;  // 拟人化最小操作延迟 3.5s
  public static readonly MAX_HUMAN_DELAY_MS = 7500;  // 拟人化最大操作延迟 7.5s

  constructor(filePath: string = path.resolve(process.cwd(), 'data/memory/anti_risk_state.json')) {
    this.stateFilePath = filePath;
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
    console.warn(`\n🚨 [风控熔断激活] 检测到潜在风控风险：「${reason}」！`);
    console.warn(`🛡️ 系统已主动切断所有招聘平台动作，进入账号休眠保护状态！\n`);
  }

  /**
   * 手动复位安全熔断
   */
  public resetCircuitBreaker(): void {
    this.state.circuitBreakerTripped = false;
    this.state.trippedReason = undefined;
    this.state.trippedAt = undefined;
    this.saveState();
    console.log(`✅ [风控熔断复位] 系统已退出休眠保护，恢复正常安全模式。`);
  }

  /**
   * 检查今日配额是否超限
   */
  public checkQuota(platform: string): boolean {
    this.checkAndResetDailyQuota();
    const count = this.state.dailyCount[platform] || 0;
    return count < AntiRiskEngine.MAX_DAILY_PER_PLATFORM;
  }

  /**
   * 消耗一次平台安全配额
   */
  public recordUsage(platform: string): void {
    this.checkAndResetDailyQuota();
    this.state.dailyCount[platform] = (this.state.dailyCount[platform] || 0) + 1;
    this.saveState();
  }

  /**
   * 拟人化随机延迟等待（模拟真实人类阅读与停顿，带随机抖动）
   */
  public async humanJitterDelay(minMs: number = AntiRiskEngine.MIN_HUMAN_DELAY_MS, maxMs: number = AntiRiskEngine.MAX_HUMAN_DELAY_MS): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 检测页面文本是否出现任何风控或反爬阻断特征
   */
  public detectRiskSignatures(htmlOrText: string): { hasRisk: boolean; signature?: string } {
    const lower = htmlOrText.toLowerCase();

    const dangerSignatures = [
      { pattern: '403.html', reason: '触发平台 403 访问控制阻断' },
      { pattern: '_security_check', reason: '触发安全验证码挑战' },
      { pattern: 'security_verify', reason: '触发滑块验证拦截' },
      { pattern: 'zp/403.html', reason: 'Boss直聘风控拦截页' },
      { pattern: '访问过于频繁', reason: '触发平台频控阈值' },
      { pattern: '网络异常，请刷新', reason: '连接被安全网关重置' },
      { pattern: '请输入验证码', reason: '触发人机验证码' },
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
      if (fs.existsSync(this.stateFilePath)) {
        return JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
      }
    } catch (e) {}
    return {
      circuitBreakerTripped: false,
      dailyCount: {},
      currentDate: new Date().toISOString().split('T')[0]
    };
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {}
  }
}
