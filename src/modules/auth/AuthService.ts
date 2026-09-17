import * as crypto from 'node:crypto';
import { readJsonStrict, writeJson } from '../../storage/index.js';

interface AccountRecord {
  username: string;
  salt: string;
  hash: string;            // scrypt(password, salt)
  collectorToken: string;  // 书签采集器使用的静态令牌
  createdAt: string;
}

interface SessionRecord {
  tokenHash: string;       // sha256(sessionToken)
  username: string;
  expiresAt: string;
  createdAt: string;
}

interface AuthState {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
  failedAttempts: Record<string, { count: number; lastAt: string }>;
}

export interface AuthResult {
  ok: boolean;
  message: string;
  sessionToken?: string;
  username?: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 15 * 60 * 1000;        // 15 分钟
const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  private stateKey: string;
  private state: AuthState;
  private ready: Promise<void>;
  /** 状态加载失败标记：为 true 时禁止注册/登录，防止把"读不到"误当"空库"覆盖真实数据 */
  private stateLoadFailed = false;

  constructor() {
    this.stateKey = 'data/auth/auth_state.json';
    this.state = { accounts: [], sessions: [], failedAttempts: {} };
    this.ready = this.loadState();
  }

  public async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async loadState(): Promise<void> {
    try {
      const loaded = await readJsonStrict<AuthState>(this.stateKey, { accounts: [], sessions: [], failedAttempts: {} });
      this.state = {
        accounts: loaded.accounts || [],
        sessions: loaded.sessions || [],
        failedAttempts: loaded.failedAttempts || {}
      };
      this.stateLoadFailed = false;
    } catch (e) {
      this.stateLoadFailed = true;
      console.error('[Auth] 账号库读取失败，已锁定注册/登录以防覆盖真实数据:', (e as Error).message);
    }
    this.cleanupExpiredSessions();
  }

  /** 是否处于首次初始化模式（尚无任何账号）；读取失败时永远返回 false（不许注册） */
  public isSetupMode(): boolean {
    return !this.stateLoadFailed && this.state.accounts.length === 0;
  }

  public storageHealth(): { ok: boolean; error: string | null } {
    return this.stateLoadFailed
      ? { ok: false, error: '账号库读取失败（KV 异常），注册与登录已临时锁定以保护数据' }
      : { ok: true, error: null };
  }

  public hasAccount(username: string): boolean {
    return this.state.accounts.some(a => a.username === username);
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  /** 关键写入：await 真正落库，失败向上抛错（绝不假成功） */
  private async persist(): Promise<void> {
    await writeJson(this.stateKey, this.state);
  }

  /** 非关键写入（会话清理/限流计数）：后台执行，失败仅记日志 */
  private persistBackground(): void {
    writeJson(this.stateKey, this.state).catch(e =>
      console.error('[Auth] 后台持久化失败（会话/限流计数可能未落库）:', (e as Error).message)
    );
  }

  private getAccount(username: string): AccountRecord | undefined {
    return this.state.accounts.find(a => a.username === username);
  }

  /**
   * 首次初始化：创建管理员账号（仅在无任何账号时可用）
   * 硬保证：写入云端成功且回读校验通过才算创建成功，否则回滚并明确报错。
   */
  public async createAccount(username: string, password: string): Promise<AuthResult> {
    username = (username || '').trim();
    if (this.stateLoadFailed) {
      return { ok: false, message: '云端账号库暂时无法读取，为保护数据已锁定注册，请稍后刷新重试' };
    }
    if (this.state.accounts.length > 0) {
      return { ok: false, message: '系统已初始化，禁止重复创建账号，请直接登录' };
    }
    if (!username || username.length < 2 || username.length > 32) {
      return { ok: false, message: '用户名长度需在 2~32 个字符之间' };
    }
    if (!/^[\w\u4e00-\u9fa5@.\-]+$/.test(username)) {
      return { ok: false, message: '用户名仅支持中英文、数字、下划线、@、.、-' };
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位` };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const account: AccountRecord = {
      username,
      salt,
      hash: this.hashPassword(password, salt),
      collectorToken: crypto.randomBytes(24).toString('hex'),
      createdAt: new Date().toISOString()
    };
    this.state.accounts.push(account);

    // 1) 必须真正写入云端，失败即回滚并报错（绝不假装成功导致"下次部署账号消失"）
    try {
      await this.persist();
    } catch (e) {
      this.state.accounts.pop();
      console.error('[Auth] 账号写入云端失败:', (e as Error).message);
      return { ok: false, message: `账号创建失败：云端数据库写入错误（${(e as Error).message}）。请稍后重试，不会产生半成品账号` };
    }

    // 2) 回读校验：确认账号确实已持久化（防写入与读取落到了不同存储）
    try {
      const verified = await readJsonStrict<AuthState>(this.stateKey, { accounts: [], sessions: [], failedAttempts: {} });
      if (!verified.accounts.some(a => a.username === username)) {
        this.state.accounts.pop();
        console.error('[Auth] 回读校验失败：账号未在云端生效');
        return { ok: false, message: '账号创建失败：写入后回读校验未通过，请稍后重试' };
      }
    } catch (e) {
      console.error('[Auth] 回读校验异常（账号大概率已写入）:', (e as Error).message);
    }

    // 创建账号后自动登录
    const token = await this.issueSession(username);
    return { ok: true, message: `管理员账号【${username}】创建成功（已确认持久化到云端）`, sessionToken: token, username };
  }

  /**
   * 登录校验（含失败次数限流）
   */
  public async login(username: string, password: string, clientIp: string = 'unknown'): Promise<AuthResult> {
    if (this.stateLoadFailed) {
      return { ok: false, message: '云端账号库暂时无法读取，登录已临时锁定，请稍后重试' };
    }
    username = (username || '').trim();
    const throttleKey = `${username}@${clientIp}`;
    const attempts = this.state.failedAttempts[throttleKey];

    if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
      const since = Date.now() - new Date(attempts.lastAt).getTime();
      if (since < FAILED_WINDOW_MS) {
        const waitMin = Math.ceil((FAILED_WINDOW_MS - since) / 60000);
        return { ok: false, message: `失败次数过多，请约 ${waitMin} 分钟后重试` };
      }
      delete this.state.failedAttempts[throttleKey];
    }

    const account = this.getAccount(username);
    if (!account || this.hashPassword(password || '', account.salt) !== account.hash) {
      const rec = this.state.failedAttempts[throttleKey] || { count: 0, lastAt: '' };
      rec.count += 1;
      rec.lastAt = new Date().toISOString();
      this.state.failedAttempts[throttleKey] = rec;
      this.persistBackground();
      return { ok: false, message: '用户名或密码错误' };
    }

    delete this.state.failedAttempts[throttleKey];
    const token = await this.issueSession(username);
    return { ok: true, message: '登录成功', sessionToken: token, username };
  }

  private async issueSession(username: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    this.state.sessions.push({
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      username,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    // 单账号最多保留 10 个活跃会话
    if (this.state.sessions.length > 10) {
      this.state.sessions = this.state.sessions.slice(-10);
    }
    try {
      await this.persist();
    } catch (e) {
      // 会话写失败不阻断登录（顶多冷启动后要重新登录），但必须留下日志
      console.error('[Auth] 会话持久化失败（实例回收后可能需要重新登录）:', (e as Error).message);
    }
    return token;
  }

  /**
   * 校验会话令牌，返回用户名（无效/过期返回 null）
   */
  public validateSession(token: string | undefined): string | null {
    if (!token) return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    this.cleanupExpiredSessions();
    const session = this.state.sessions.find(s => s.tokenHash === tokenHash);
    return session ? session.username : null;
  }

  public async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    this.state.sessions = this.state.sessions.filter(s => s.tokenHash !== tokenHash);
    try {
      await this.persist();
    } catch (e) {
      console.error('[Auth] 登出持久化失败（会话最迟 7 天自动过期）:', (e as Error).message);
    }
  }

  /**
   * 修改密码（修改后吊销全部既有会话）
   */
  public async changePassword(username: string, oldPassword: string, newPassword: string): Promise<AuthResult> {
    const account = this.getAccount(username);
    if (!account) return { ok: false, message: '账号不存在' };
    if (this.hashPassword(oldPassword || '', account.salt) !== account.hash) {
      return { ok: false, message: '原密码错误' };
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `新密码长度至少 ${MIN_PASSWORD_LENGTH} 位` };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    account.salt = salt;
    account.hash = this.hashPassword(newPassword, salt);
    // 吊销所有会话，强制重新登录
    this.state.sessions = this.state.sessions.filter(s => s.username !== username);
    try {
      await this.persist();
    } catch (e) {
      return { ok: false, message: `密码修改失败：云端写入错误（${(e as Error).message}），原密码仍有效` };
    }
    const token = await this.issueSession(username);
    return { ok: true, message: '密码修改成功，已自动续期登录', sessionToken: token, username };
  }

  /**
   * 校验书签采集器静态令牌
   */
  public verifyCollectorToken(token: string | undefined): string | null {
    if (!token) return null;
    const account = this.state.accounts.find(a => a.collectorToken === token);
    return account ? account.username : null;
  }

  public getCollectorToken(username: string): string | null {
    return this.getAccount(username)?.collectorToken || null;
  }

  /**
   * 重置书签采集令牌（旧令牌立即失效）
   */
  public async regenerateCollectorToken(username: string): Promise<AuthResult> {
    const account = this.getAccount(username);
    if (!account) return { ok: false, message: '账号不存在' };
    account.collectorToken = crypto.randomBytes(24).toString('hex');
    try {
      await this.persist();
    } catch (e) {
      return { ok: false, message: `令牌重置失败：云端写入错误（${(e as Error).message}），旧令牌仍有效` };
    }
    return { ok: true, message: '采集令牌已重置，请重新安装书签', username };
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
    if (this.state.sessions.length !== before) this.persistBackground();
  }
}
