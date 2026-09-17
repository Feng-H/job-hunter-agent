import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  private statePath: string;
  private state: AuthState;

  constructor(stateDir?: string) {
    const dir = stateDir || path.resolve(process.cwd(), 'data/auth');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.statePath = path.join(dir, 'auth_state.json');

    if (fs.existsSync(this.statePath)) {
      try {
        this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      } catch (e) {
        this.state = { accounts: [], sessions: [], failedAttempts: {} };
      }
    } else {
      this.state = { accounts: [], sessions: [], failedAttempts: {} };
    }
    this.state.accounts = this.state.accounts || [];
    this.state.sessions = this.state.sessions || [];
    this.state.failedAttempts = this.state.failedAttempts || {};
    this.cleanupExpiredSessions();
  }

  /** 是否处于首次初始化模式（尚无任何账号） */
  public isSetupMode(): boolean {
    return this.state.accounts.length === 0;
  }

  public hasAccount(username: string): boolean {
    return this.state.accounts.some(a => a.username === username);
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  private save(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  private getAccount(username: string): AccountRecord | undefined {
    return this.state.accounts.find(a => a.username === username);
  }

  /**
   * 首次初始化：创建管理员账号（仅在无任何账号时可用）
   */
  public createAccount(username: string, password: string): AuthResult {
    username = (username || '').trim();
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
    this.save();

    // 创建账号后自动登录
    const token = this.issueSession(username);
    return { ok: true, message: `管理员账号【${username}】创建成功`, sessionToken: token, username };
  }

  /**
   * 登录校验（含失败次数限流）
   */
  public login(username: string, password: string, clientIp: string = 'unknown'): AuthResult {
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
      this.save();
      return { ok: false, message: '用户名或密码错误' };
    }

    delete this.state.failedAttempts[throttleKey];
    this.save();
    const token = this.issueSession(username);
    return { ok: true, message: '登录成功', sessionToken: token, username };
  }

  private issueSession(username: string): string {
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
    this.save();
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

  public logout(token: string | undefined): void {
    if (!token) return;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    this.state.sessions = this.state.sessions.filter(s => s.tokenHash !== tokenHash);
    this.save();
  }

  /**
   * 修改密码（修改后吊销全部既有会话）
   */
  public changePassword(username: string, oldPassword: string, newPassword: string): AuthResult {
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
    this.save();
    const token = this.issueSession(username);
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
  public regenerateCollectorToken(username: string): AuthResult {
    const account = this.getAccount(username);
    if (!account) return { ok: false, message: '账号不存在' };
    account.collectorToken = crypto.randomBytes(24).toString('hex');
    this.save();
    return { ok: true, message: '采集令牌已重置，请重新安装书签', username };
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
    if (this.state.sessions.length !== before) this.save();
  }
}
