function escapeHtml(str?: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderFeishuActionHtml(options: {
  success: boolean;
  actionTitle: string;
  badgeText: string;
  badgeType: "success" | "danger" | "info";
  company: string;
  title: string;
  salary?: string;
  platform?: string;
  city?: string;
  description: string;
  jobUrl?: string;
}): string {
  const isSuccess = options.badgeType === "success";
  const isDanger = options.badgeType === "danger";

  const badgeStyle = isSuccess
    ? "background-color: #ecfdf5; color: #047857; border-color: #a7f3d0;"
    : (isDanger ? "background-color: #fff1f2; color: #be123c; border-color: #fecdd3;" : "background-color: #eef2ff; color: #4338ca; border-color: #c7d2fe;");

  const iconBg = isSuccess ? "#10b981" : (isDanger ? "#f43f5e" : "#6366f1");
  const iconSvg = isSuccess
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>'
    : (isDanger
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.actionTitle)} - Job-Hunter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 1rem;
      max-width: 480px;
      width: 100%;
      padding: 2rem 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      text-align: center;
    }
    .icon-wrapper {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${iconBg};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      color: white;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .title {
      font-size: 1.35rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 9999px;
      border: 1px solid;
      margin-bottom: 1.25rem;
      ${badgeStyle}
    }
    .job-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1rem;
      text-align: left;
      margin-bottom: 1.25rem;
    }
    .job-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 0.25rem;
    }
    .job-meta {
      font-size: 0.85rem;
      color: #64748b;
      line-height: 1.5;
    }
    .job-salary {
      color: #d97706;
      font-weight: 600;
    }
    .description {
      font-size: 0.9rem;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 1.5rem;
      text-align: left;
      background: #f8fafc;
      padding: 0.85rem;
      border-radius: 0.5rem;
      border-left: 3px solid ${iconBg};
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: 0.6rem;
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
    }
    .btn-primary {
      background: #4f46e5;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #4338ca;
    }
    .btn-secondary {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover {
      background: #f1f5f9;
    }
    .footer-tip {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${iconSvg}
      </svg>
    </div>
    <h1 class="title">${escapeHtml(options.actionTitle)}</h1>
    <div class="badge">${escapeHtml(options.badgeText)}</div>

    <div class="job-box">
      <div class="job-title">${escapeHtml(options.title)}</div>
      <div class="job-meta">
        🏢 <strong>${escapeHtml(options.company)}</strong>
        ${options.city ? ` ｜ 📍 ${escapeHtml(options.city)}` : ""}
        ${options.platform ? ` ｜ 🏷️ ${escapeHtml(options.platform)}` : ""}
      </div>
      ${options.salary ? `<div class="job-meta job-salary">💰 ${escapeHtml(options.salary)}</div>` : ""}
    </div>

    <div class="description">${escapeHtml(options.description)}</div>

    <div class="btn-group">
      <a href="/" class="btn btn-primary">📊 进入求职工作台看板</a>
      ${options.jobUrl && options.jobUrl !== "https://example.com" ? `<a href="${escapeHtml(options.jobUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">🔗 打开原招聘网站职位页</a>` : ""}
      <button onclick="try{window.close();}catch(e){}window.history.back();" class="btn btn-secondary">✖️ 关闭本页面</button>
    </div>

    <div class="footer-tip">Job-Hunter Agent · 飞书多端智能互联</div>
  </div>
</body>
</html>`;
}

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobHunterCore } from '../../core.js';
import { JobPost } from '../../types/index.js';
import { LlmClient } from '../ai/LlmClient.js';
import { AntiRiskEngine } from '../safety/AntiRiskEngine.js';
import { PiSessionCopilot } from '../ai/PiSessionCopilot.js';
import { OnboardingService } from '../onboarding/OnboardingService.js';
import { AuthService } from '../auth/AuthService.js';
import { DEMO_JOBS, DEMO_PROFILE, getDemoAiAnalysis, getDemoTailoredResume } from '../demo/DemoData.js';
import { RegionalCareerRadar, RegionalCompanyPortal, PRESET_REGIONAL_PORTALS } from '../discovery/RegionalCareerRadar.js';
import { CompanyResolver, ExtendedJobPost } from '../discovery/CompanyResolver.js';
import { readJson, writeJson, getStorage } from '../../storage/index.js';
import { applyPreferencesUpdate } from './PreferencesService.js';

const SESSION_COOKIE = 'jobhunter_session';

export class CollectorServer {
  private server: http.Server | null = null;
  private agent: JobHunterCore;
  private port: number;
  private llmClient: LlmClient;
  private onboardingService: OnboardingService;
  private auth: AuthService;
  private careerRadar: RegionalCareerRadar;
  private companyResolver: CompanyResolver;

  constructor(agent?: JobHunterCore, port: number = 8765) {
    this.agent = agent || new JobHunterCore();
    this.port = port;
    this.llmClient = new LlmClient();
    this.onboardingService = new OnboardingService();
    this.auth = new AuthService();
    this.careerRadar = new RegionalCareerRadar();
    this.companyResolver = new CompanyResolver();
  }

  private parseSessionCookie(req: http.IncomingMessage): string | undefined {
    const raw = req.headers.cookie || '';
    const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  private getClientIp(req: http.IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  }

  public async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    await this.auth.ensureReady();
    await this.auth.maybeRefresh(); // 多实例间会话视图 30s 节流收敛（他实例签发/注销的会话可见）
    await this.llmClient.ensureReady();

    // 允许跨域（书签采集器从招聘站点跨域提交）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const host = req.headers.host || `127.0.0.1:${this.port}`;
    const proto = req.headers['x-forwarded-proto'] === 'https' || host.includes('vercel.app') ? 'https' : 'http';
    const url = new URL(req.url || '/', `${proto}://${host}`);
    let pathname = url.pathname;

    try {
      (this.agent as any).feishu?.setRuntimeHost?.(`${proto}://${host}`);
    } catch {}

    // Vercel rewrite 兼容：/auth/** 与 /healthz 会被重写为 /api/auth/**、/api/healthz 进入本函数，
    // 函数内 req.url 可能是重写后路径或原始路径，此处统一归一化保证两种都能路由
    if (pathname.startsWith('/api/')) {
      const rest = pathname.slice('/api/'.length);
      if (rest === 'healthz' || rest.startsWith('healthz/') ||
          rest.startsWith('auth/') || rest === 'bookmarklet.js') {
        pathname = '/' + rest;
      }
    }

    const sendJson = (code: number, payload: any, cookie?: string) => {
      const headers: any = { 'Content-Type': 'application/json; charset=utf-8' };
      if (cookie) headers['Set-Cookie'] = cookie;
      res.writeHead(code, headers);
      res.end(JSON.stringify(payload));
    };

    const sendHtml = (filePath: string) => {
      try {
        const abs = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(abs)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(abs));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Page Not Found');
        }
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e.message);
      }
    };

    // ============ 0. 认证与账号管理 (Auth & Account Management) ============
    if (pathname === '/login') {
      sendHtml('public/login.html');
      return;
    }

    // 0.2 认证 API（公开）
    if (pathname.startsWith('/auth/')) {
      let authBody = '';
      req.on('data', c => authBody += c);
      req.on('end', async () => {
        try {
          const data = authBody ? JSON.parse(authBody) : {};
          const ip = this.getClientIp(req);

          if (req.method === 'GET' && pathname === '/auth/status') {
            const setupMode = this.auth.isSetupMode();
            const username = this.auth.validateSession(this.parseSessionCookie(req));
            const isDemo = !Boolean(username);
            const storage = this.auth.storageHealth();
            return sendJson(200, {
              code: 0,
              setupMode,
              loggedIn: Boolean(username),
              username: username || null,
              isDemo,
              storageOk: storage.ok,
              storageError: storage.error
            });
          }

          if (req.method === 'POST' && pathname === '/auth/setup') {
            const result = await this.auth.createAccount(data.username, data.password);
            const cookie = result.sessionToken
              ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`
              : undefined;
            return sendJson(result.ok ? 200 : 400, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }

          if (req.method === 'POST' && pathname === '/auth/login') {
            const result = await this.auth.login(data.username, data.password, ip);
            const cookie = result.sessionToken
              ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`
              : undefined;
            return sendJson(result.ok ? 200 : 401, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }

          if (req.method === 'POST' && pathname === '/auth/logout') {
            await this.auth.logout(this.parseSessionCookie(req));
            const cookie = `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
            return sendJson(200, { code: 0, message: '已安全退出登录' }, cookie);
          }

          // 以下认证接口需要已登录会话
          const sessionUser = this.auth.validateSession(this.parseSessionCookie(req));
          if (!sessionUser) {
            return sendJson(401, { code: -1, message: '请先登录管理员账号' });
          }

          if (req.method === 'POST' && pathname === '/auth/change-password') {
            const result = await this.auth.changePassword(sessionUser, data.oldPassword, data.newPassword);
            const cookie = result.sessionToken
              ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`
              : undefined;
            return sendJson(result.ok ? 200 : 400, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }

          if (req.method === 'GET' && pathname === '/auth/collector-token') {
            return sendJson(200, {
              code: 0,
              username: sessionUser,
              collectorToken: this.auth.getCollectorToken(sessionUser)
            });
          }

          if (req.method === 'POST' && pathname === '/auth/collector-token/regenerate') {
            const result = await this.auth.regenerateCollectorToken(sessionUser);
            return sendJson(result.ok ? 200 : 400, {
              code: result.ok ? 0 : -1,
              message: result.message,
              collectorToken: this.auth.getCollectorToken(sessionUser)
            });
          }

          return sendJson(404, { code: -1, message: '未知的认证接口' });
        } catch (e: any) {
          return sendJson(500, { code: -1, message: e.message });
        }
      });
      return;
    }

    // 0.3 采集器 JS 静态资源（public/ 静态托管优先，服务端兜底本地开发）
    if (pathname === '/bookmarklet.js') {
      const publicPath = path.resolve(process.cwd(), 'public/bookmarklet.js');
      const scriptsPath = path.resolve(process.cwd(), 'scripts/bookmarklet.js');
      const jsPath = fs.existsSync(publicPath) ? publicPath : scriptsPath;
      if (fs.existsSync(jsPath)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(fs.readFileSync(jsPath));
      } else {
        res.writeHead(404);
        res.end('bookmarklet not found');
      }
      return;
    }

    // 0.4 鉴权计算：判断当前请求是否为合法管理员
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const sessionUser = this.auth.validateSession(this.parseSessionCookie(req));
    const tokenUser = this.auth.verifyCollectorToken(bearer || url.searchParams.get('token') || undefined);
    const authenticatedUser = sessionUser || tokenUser;
    const isDemo = !Boolean(authenticatedUser);

    // ============ 1. 静态页面路由 ============
    // 1.1 主页与 Demo 页
    // 若显式访问 /demo，或者未登录访问 /，都呈现 Web 看板（前端会根据 /auth/status 自适应 Demo 模式）
    if (pathname === '/' || pathname === '/index.html' || pathname === '/demo') {
      sendHtml('public/index.html');
      return;
    }

    // 1.2 一键书签安装页（未登录导向登录）
    if (pathname === '/setup') {
      if (isDemo) {
        res.writeHead(302, { Location: '/login?redirect=/setup' });
        res.end();
        return;
      }
      sendHtml('public/setup.html');
      return;
    }

    // 1.3 初始化入职向导
    if (pathname === '/onboarding') {
      if (isDemo) {
        res.writeHead(302, { Location: '/login?redirect=/onboarding' });
        res.end();
        return;
      }
      sendHtml('public/onboarding.html');
      return;
    }

    // ============ 2. 系统状态与个人档案 API ============
    if (pathname === '/api/system/status') {
      if (isDemo) {
        // Demo 模式下返回已初始化的演示状态，隐藏敏感配置
        return sendJson(200, {
          code: 0,
          initialized: true,
          hasLlm: false, // 对访客隐藏真实 LLM 状态
          hasProfile: true,
          candidateName: '李明 (Demo 演示模式)',
          isDemo: true
        });
      }
      const sysStatus = await this.onboardingService.getSystemStatusAsync();
      return sendJson(200, {
        code: 0,
        ...sysStatus,
        isDemo: false
      });
    }

    if (pathname === '/api/profile') {
      if (req.method === 'GET') {
        if (isDemo) {
          return sendJson(200, { code: 0, profile: DEMO_PROFILE, isDemo: true });
        }
        const prof = await readJson('data/profile/master_profile.json', null);
        return sendJson(200, { code: 0, profile: prof, isDemo: false });
      }
      if (req.method === 'POST') {
        if (isDemo) {
          return sendJson(403, { code: -1, error: '演示模式下禁止修改候选人主档案' });
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            await writeJson('data/profile/master_profile.json', data);
            return sendJson(200, { code: 0, message: '全量履历档案保存成功！' });
          } catch (e: any) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }

    // ============ 3. 看板流水线数据 API ============
    if (req.method === 'GET' && pathname === '/api/jobs') {
      if (isDemo) {
        // Demo 模式：提供隔离的脱敏示例岗位流程
        return sendJson(200, { code: 0, jobs: DEMO_JOBS, isDemo: true });
      }
      const tracker = (this.agent as any).tracker;
      await tracker.reload?.(); // 读板前重载 KV 最新数据，防多实例旧快照
      const records = tracker.getAllRecords();
      return sendJson(200, { code: 0, jobs: records, isDemo: false });
    }

    // 按最新规则批量重筛历史岗位（规则变更后抢救被误拒的岗位；纯 Workflow 初筛，0 LLM 消耗）
    if (req.method === 'POST' && pathname === '/api/jobs/refilter') {
      if (isDemo) {
        return sendJson(403, { code: -1, error: '演示模式下禁止重筛真实岗位' });
      }
      try {
        const result = await this.agent.refilterAllJobs();
        return sendJson(200, {
          code: 0,
          message: `重筛完成：${result.rechecked} 个历史岗位按最新规则重新判定，${result.promoted} 个晋升待复核，${result.stillRejected} 个仍被红线拦截`,
          ...result
        });
      } catch (e: any) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }

    // 岗位状态流转操作
    if (req.method === 'POST' && pathname.startsWith('/api/jobs/') && pathname.endsWith('/action')) {
      if (isDemo) {
        // Demo 模式下只做沙箱模拟，不污染生产数据
        return sendJson(200, {
          code: 0,
          message: '【演示模式】模拟操作成功！当前数据仅在沙箱中展示，不会影响生产数据。'
        });
      }
      const parts = pathname.split('/');
      const jobId = parts[3];
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          await (this.agent as any).tracker.reload?.(); // 状态写前重载最新数据，防整库旧快照覆盖
          const { action, reason } = JSON.parse(body);
          await this.agent.handleUserAction(jobId, action === 'APPROVED' ? 'APPROVED' : 'REJECTED', reason);
          return sendJson(200, { code: 0, message: '操作成功' });
        } catch (e: any) {
          return sendJson(400, { code: -1, error: e.message });
        }
      });
      return;
    }

    // 极速扫描（仅管理员可用；本地专属能力，按需动态加载避免进入云函数冷启动链）
    if (req.method === 'POST' && pathname === '/api/scan') {
      if (isDemo) {
        return sendJson(403, { code: -1, error: '演示模式下禁止触发真实爬虫扫描' });
      }
      if (process.env.VERCEL || process.platform !== 'darwin') {
        return sendJson(400, {
          code: -1,
          error: '云端部署或非 macOS 环境无法直接读取本地前台 Chrome。\n请前往「/setup」页面安装专属 Chrome 扩展或使用一键书签采集器，在招聘网站即可随时同步职位！'
        });
      }
      try {
        const { StandaloneJobHunter } = await import('../../standalone.js');
        const standalone = new StandaloneJobHunter();
        const count = await standalone.runSingleScan();
        return sendJson(200, { code: 0, message: `扫描完成，本次共提取并推送了 ${count} 个高匹配职位！` });
      } catch (e: any) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }

    // ============ 3.9 地区官网招聘雷达（零风控渠道发现） ============
    if (pathname === '/api/radar/portals') {
      if (req.method === 'GET') {
        // Demo 模式：返回精选示例门户，隐藏 AI 动态检索能力（避免真实 LLM 计费）
        if (isDemo) {
          return sendJson(200, {
            code: 0,
            city: 'Demo 精选',
            source: 'preset',
            isDemo: true,
            portals: PRESET_REGIONAL_PORTALS.slice(0, 5)
          });
        }
        return sendJson(200, {
          code: 0,
          city: '全国精选',
          source: 'preset',
          isDemo: false,
          portals: PRESET_REGIONAL_PORTALS
        });
      }
      if (req.method === 'POST') {
        // 按指定城市检索企业门户（预置库优先，不足时由管理员专属 LLM 动态挖掘）
        if (isDemo) {
          return sendJson(403, { code: -1, error: '演示模式下仅可浏览精选门户列表，动态城市检索需管理员登录' });
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const { city, industry } = JSON.parse(body || '{}');
            const result = await this.careerRadar.getPortalsForCity(city, industry);
            return sendJson(200, { code: 0, ...result, isDemo: false });
          } catch (e: any) {
            return sendJson(500, { code: -1, error: e.message });
          }
        });
        return;
      }
    }

    // ============ 4. LLM 配置隔离（绝不给 Demo 模式使用） ============
    if (pathname === '/api/config/llm') {
      if (isDemo) {
        // Demo 模式下，返回纯脱敏占位信息，严禁暴露真实 Key
        return sendJson(200, {
          provider: 'demo-sandbox',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini (Demo)',
          apiKey: '••••••••',
          hasKey: false,
          isDemo: true
        });
      }
      if (req.method === 'GET') {
        return sendJson(200, this.llmClient.getMaskedConfig());
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const newCfg = JSON.parse(body);
            await this.llmClient.saveConfig(newCfg);
            return sendJson(200, { code: 0, message: 'LLM 配置已安全保存' });
          } catch (e: any) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/api/config/llm/test') {
      if (isDemo) {
        // Demo 模式下返回沙箱测试成功，绝对不消耗真实 token
        return sendJson(200, {
          success: true,
          message: '【Demo 演示沙箱】连通性测试通过（已保护私有密钥，未发起实际 API 计费）'
        });
      }
      const testRes = await this.llmClient.testConnection();
      return sendJson(200, testRes);
    }

    // ============ 5. 安全风控与偏好规则配置 ============
    if (pathname === '/api/safety/status') {
      const safety = new AntiRiskEngine();
      return sendJson(200, safety.getState());
    }

    if (req.method === 'POST' && pathname === '/api/safety/reset') {
      if (isDemo) {
        return sendJson(200, { code: 0, message: '【Demo 模式】风控熔断已模拟复位' });
      }
      const safety = new AntiRiskEngine();
      safety.resetCircuitBreaker();
      return sendJson(200, { code: 0, message: '风控熔断已成功复位！' });
    }

    if (pathname === '/api/config/feishu') {
      if (isDemo) {
        if (req.method === 'GET') {
          return sendJson(200, {
            webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/••••••••',
            appId: 'cli_••••••••',
            appSecret: '••••••••',
            serviceBaseUrl: 'https://job-hunter-agent-orpin.vercel.app',
            isDemo: true
          });
        }
        return sendJson(403, { code: -1, error: '演示模式下禁止修改飞书配置' });
      }
      if (req.method === 'GET') {
        const feishuConf = await readJson('data/preferences/feishu.json', {
          webhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
          appId: process.env.FEISHU_APP_ID || '',
          appSecret: process.env.FEISHU_APP_SECRET || '',
          serviceBaseUrl: process.env.FEISHU_SERVICE_BASE_URL || ''
        });
        const detectedBaseUrl = (this.agent as any).feishu?.getBaseUrl?.() || 'https://job-hunter-agent-orpin.vercel.app';
        return sendJson(200, { ...feishuConf, detectedBaseUrl });
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            await writeJson('data/preferences/feishu.json', data);
            try { await this.agent.reloadConfig(); } catch (e) {}
            return sendJson(200, { code: 0, message: '飞书配置已更新并即刻生效！' });
          } catch (e: any) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/api/config/feishu/test') {
      if (isDemo) {
        return sendJson(200, { success: true, message: '【Demo 演示模式】已模拟发送飞书测试卡片（真实发送请登录管理员）' });
      }
      const feishu = (this.agent as any).feishu;
      if (feishu?.reloadConfig) {
        await feishu.reloadConfig();
      }
      const result = await feishu.sendNotification(
        {
          id: 'test_demo',
          title: '资深全栈架构师 (测试推送)',
          company: '测试科技集团',
          city: '上海',
          workMode: 'REMOTE',
          salaryText: '35-50K·15薪',
          description: '飞书通道测试卡片',
          url: 'https://example.com',
          platform: 'BOSS',
          publishOrActiveTime: '刚刚在线',
          discoveredAt: new Date().toISOString()
        },
        {
          passed: true,
          score: 95,
          reasons: ['时效优良：刚刚在线', '双休保障：周末双休', '技能匹配：全栈架构'],
          breakdown: { skillMatch: 40, experienceMatch: 30, scheduleAndBenefits: 20, growthAndDomain: 5 }
        },
        {
          jobId: 'test_demo',
          company: '测试科技集团',
          jobTitle: '资深全栈架构师',
          generatedAt: new Date().toISOString(),
          markdownContent: '# 测试简历',
          greetingMessage: '您好！这是一条测试卡片，说明飞书通道已完美打通！',
          keyMatchingPoints: ['全栈架构', '高并发']
        },
        { skipUrlCheck: true }
      );
      return sendJson(200, result);
    }
    // ============ 3.8.1 飞书开放平台 Webhook 回调端点 (原生交互 / Challenge 验证) ============
    if (pathname === '/api/feishu/webhook') {
      if (req.method === 'GET') {
        return sendJson(200, { code: 0, status: 'ok', message: '飞书 Webhook 交互端点已就绪！' });
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {};

            // 1. 飞书开放平台 URL 验证挑战响应 (Challenge Handshake)
            if (data.type === 'url_verification' || data.challenge) {
              console.log(`🤝 [Feishu Webhook] 收到开放平台 URL 验证握手 Challenge: ${data.challenge}`);
              return sendJson(200, { challenge: data.challenge });
            }

            // 2. 卡片交互动作 (card.action.trigger)
            let actionValue = data.action?.value || data.event?.action?.value;
            if (typeof actionValue === 'string') {
              try { actionValue = JSON.parse(actionValue); } catch {}
            }

            if (actionValue && typeof actionValue === 'object') {
              const actionType = actionValue.action;
              const jobId = actionValue.jobId;

              console.log(`📥 [Feishu Webhook] 收到卡片动作触发: action=${actionType}, jobId=${jobId}`);

              if (jobId === 'test_demo') {
                return sendJson(200, {
                  toast: {
                    type: 'success',
                    content: '🎉 飞书卡片交互测试成功！系统已正常接收并处理您的操作。'
                  }
                });
              }

              await (this.agent as any).tracker.reload?.();
              const record = (this.agent as any).tracker.getRecord(jobId);
              if (!record) {
                return sendJson(200, {
                  toast: {
                    type: 'warning',
                    content: '⚠️ 未找到该岗位记录（可能已被重筛淘汰或清理）'
                  }
                });
              }

              if (actionType === 'APPROVE') {
                await this.agent.handleUserAction(jobId, 'APPROVED');
                return sendJson(200, {
                  toast: {
                    type: 'success',
                    content: `✅ 已确认投递【${record.job.company} · ${record.job.title}】！看板状态已更新`
                  }
                });
              } else if (actionType === 'REJECT') {
                await this.agent.handleUserAction(jobId, 'REJECTED', '飞书卡片直接拒绝');
                return sendJson(200, {
                  toast: {
                    type: 'info',
                    content: `🛑 已拒绝【${record.job.company}】并记录至负反馈库`
                  }
                });
              } else if (actionType === 'REQUEST_TWEAK') {
                await this.agent.handleUserAction(jobId, 'REQUEST_TWEAK', '飞书卡片要求调整简历');
                return sendJson(200, {
                  toast: {
                    type: 'info',
                    content: `✏️ 已触发针对【${record.job.company}】的简历调整流程`
                  }
                });
              }
            }

            return sendJson(200, { code: 0, msg: 'success' });
          } catch (e: any) {
            console.error('[Feishu Webhook] 处理异常:', e);
            return sendJson(200, {
              toast: {
                type: 'error',
                content: `处理操作异常: ${e.message}`
              }
            });
          }
        });
        return;
      }
    }

    // ============ 3.8.2 飞书卡片动作直接跳转端点 (URL Action Fallback) ============
    // 无论使用群自定义机器人还是自建应用，点击卡片按钮的跳转链接均可一键完成流转，
    // 彻底解决飞书客户端提示「未配置卡片交互功能」的问题！
    if (pathname === '/api/feishu/action') {
      const handleAction = async (action: string, jobId: string) => {
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: false,
            actionTitle: '参数错误',
            badgeText: '缺少 Job ID',
            badgeType: 'danger',
            company: '系统提示',
            title: '操作无法继续',
            description: '请求中未包含有效的岗位 ID，请返回求职看板核对。'
          }));
          return;
        }

        if (jobId === 'test_demo') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: true,
            actionTitle: '飞书交互测试完全成功！',
            badgeText: action === 'APPROVE' ? '测试动作：确认投递' : (action === 'REJECT' ? '测试动作：拒绝岗位' : '测试动作：微调简历'),
            badgeType: 'success',
            company: '测试科技集团',
            title: '资深全栈架构师 (测试推送)',
            salary: '35-50K·15薪',
            city: '上海',
            platform: 'BOSS直聘',
            description: '🎉 恭喜！您在飞书中点击的审批按钮已成功打通并送达求职系统！\n\n无论使用飞书群自定义机器人还是自建应用，本端点都能确保卡片按钮点击后状态自动生效，彻底告别「未配置卡片交互功能」提示！',
            jobUrl: 'https://example.com'
          }));
          return;
        }

        await (this.agent as any).tracker.reload?.();
        const record = (this.agent as any).tracker.getRecord(jobId);
        if (!record) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: false,
            actionTitle: '未找到该岗位记录',
            badgeText: '岗位不存在或已清理',
            badgeType: 'danger',
            company: '未知企业',
            title: '岗位信息失效',
            description: '未在当前看板库中找到该岗位记录（可能已被重筛淘汰、被管理员清理或测试数据已重置）。请返回工作台看板查看最新职位。'
          }));
          return;
        }

        const company = record.job.company;
        const title = record.job.title;
        const salary = record.job.salaryText;
        const city = record.job.city;
        const platform = record.job.platform;
        const jobUrl = record.job.url;

        if (action === 'APPROVE') {
          await this.agent.handleUserAction(jobId, 'APPROVED');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: true,
            actionTitle: '✅ 投递意向已确认！',
            badgeText: '已更新为：已投递 / 待跟进',
            badgeType: 'success',
            company,
            title,
            salary,
            city,
            platform,
            description: `已成功将【${company} · ${title}】移入「已投递」看板！定制简历与沟通话术已就绪，请保持关注后续 HR 回复与面试进展。`,
            jobUrl
          }));
          return;
        }

        if (action === 'REJECT') {
          await this.agent.handleUserAction(jobId, 'REJECTED', '飞书卡片操作拒绝');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: true,
            actionTitle: '🛑 已标记不合适',
            badgeText: '已移入拒绝库',
            badgeType: 'danger',
            company,
            title,
            salary,
            city,
            platform,
            description: `已将【${company} · ${title}】标记为拒绝，并已沉淀至 AI 负反馈偏好记忆库，后续系统将自动降低此类企业或 JD 的推荐权重。`,
            jobUrl
          }));
          return;
        }

        if (action === 'REQUEST_TWEAK') {
          await this.agent.handleUserAction(jobId, 'REQUEST_TWEAK', '飞书卡片请求微调简历');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderFeishuActionHtml({
            success: true,
            actionTitle: '✏️ 简历微调需求已接收',
            badgeText: '状态：待调整复核',
            badgeType: 'info',
            company,
            title,
            salary,
            city,
            platform,
            description: `已收到针对【${company} · ${title}】的简历调整请求！建议登录工作台看板，直接与 AI 对话微调专属简历亮点。`,
            jobUrl
          }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderFeishuActionHtml({
          success: false,
          actionTitle: '未知操作类型',
          badgeText: `action=${action}`,
          badgeType: 'danger',
          company,
          title,
          description: '不支持的操作类型，请在飞书卡片重新选择操作。'
        }));
      };

      if (req.method === 'GET') {
        const action = url.searchParams.get('action') || 'APPROVE';
        const jobId = url.searchParams.get('jobId') || '';
        await handleAction(action, jobId);
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const action = data.action || url.searchParams.get('action') || 'APPROVE';
            const jobId = data.jobId || url.searchParams.get('jobId') || '';
            await handleAction(action, jobId);
          } catch {
            await handleAction(url.searchParams.get('action') || 'APPROVE', url.searchParams.get('jobId') || '');
          }
        });
        return;
      }
    }


    if (pathname === '/api/config/preferences') {
      if (isDemo) {
        const demoRules = await readJson('data/preferences/rules.json', {});
        if (req.method === 'GET') return sendJson(200, demoRules);
        return sendJson(403, { code: -1, error: '演示模式下禁止修改求职偏好规则' });
      }
      if (req.method === 'GET') {
        const rules = await readJson('data/preferences/rules.json', {});
        return sendJson(200, rules);
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const current: any = await readJson('data/preferences/rules.json', { scenarios: { remote: {}, onsite: {} }, strictRules: {} });
            const updated = applyPreferencesUpdate(current, data);
            await writeJson('data/preferences/rules.json', updated);
            // 同实例内立即生效（跨实例由 ensureFreshConfig 60s 节流刷新兜底）
            try { await this.agent.reloadConfig(); } catch (e) {}
            return sendJson(200, { code: 0, message: '求职偏好设置已更新，初筛规则已即刻生效！' });
          } catch (e: any) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }

    // ============ 6. Onboarding 接口群 ============
    if (pathname.startsWith('/api/onboarding/')) {
      if (isDemo) {
        return sendJson(403, { code: -1, error: '演示模式下请先登录管理员账号' });
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};

          if (pathname === '/api/onboarding/llm-test') {
            const result = await this.onboardingService.testLlm(data);
            return sendJson(200, { code: result.success ? 0 : -1, ...result });
          }

          if (pathname === '/api/onboarding/extract-file') {
            const { fileBase64, fileName } = data;
            if (!fileBase64 || !fileName) {
              return sendJson(400, { code: -1, error: '缺少文件数据' });
            }
            const buffer = Buffer.from(fileBase64, 'base64');
            const text = await this.onboardingService.extractTextFromFile(buffer, fileName);
            return sendJson(200, { code: 0, text });
          }

          if (pathname === '/api/onboarding/parse-resume') {
            const { text, llmConfig } = data;
            if (!text || !text.trim()) {
              return sendJson(400, { code: -1, error: '简历内容不能为空' });
            }
            const profile = await this.onboardingService.parseResumeWithLlm(text, llmConfig || this.llmClient.getConfig());
            return sendJson(200, { code: 0, profile });
          }

          if (pathname === '/api/onboarding/align-chat') {
            const { message, draftProfile, draftRules, history, llmConfig } = data;
            const result = await this.onboardingService.alignWithUser(
              message,
              draftProfile,
              draftRules,
              history || [],
              llmConfig || this.llmClient.getConfig()
            );
            return sendJson(200, { code: 0, ...result });
          }

          if (pathname === '/api/onboarding/complete') {
            const { profile, rules, llmConfig } = data;
            if (!profile || !rules) {
              return sendJson(400, { code: -1, error: '档案与规则数据不完整' });
            }
            await this.onboardingService.completeOnboarding(profile, rules, llmConfig || this.llmClient.getConfig());
            this.agent.reloadConfig();
            return sendJson(200, { code: 0, message: '系统初始化就绪！已成功启动。' });
          }

          return sendJson(404, { code: -1, error: '未知的 Onboarding 接口' });
        } catch (e: any) {
          return sendJson(500, { code: -1, error: e.message });
        }
      });
      return;
    }

    // ============ 7. AI 档案与履历 Copilot 对话（Demo 隔离） ============
    if (pathname === '/api/profile/chat/history') {
      if (isDemo) {
        return sendJson(200, {
          code: 0,
          history: [
            {
              role: 'assistant',
              content: '您好！当前处于【Demo 演示模式】。\n\n作为您的 AI 履历合伙人，这里展示了基于 STAR 原则对候选人战绩量化打磨的对话效果。在演示模式下，所有回答由演示沙箱生成，绝不消耗管理员真实的 LLM Token。',
              timestamp: new Date().toISOString()
            }
          ],
          status: { sessionId: 'demo-session', messageCount: 1 }
        });
      }
      const copilot = PiSessionCopilot.getInstance();
      if (req.method === 'GET') {
        const history = await copilot.getHistory();
        const status = await copilot.getStatus();
        return sendJson(200, { code: 0, history, status });
      }
      if (req.method === 'DELETE') {
        await copilot.resetSession();
        return sendJson(200, { code: 0, message: '会话已重置' });
      }
    }

    if (pathname === '/api/profile/chat') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body || '{}');
          if (!message || !message.trim()) {
            return sendJson(400, { code: -1, error: '消息内容不能为空' });
          }

        if (isDemo) {
          // Demo 模式：返回高质量模拟回答，绝对不调 LLM API
          return sendJson(200, {
            code: 0,
            reply: `【Demo 演示应答】您好！收到关于“${message.slice(0, 20)}...”的提问。\n\n在真实模式下，系统会调取您专属的 LLM 模型（如 DeepSeek-V3 / GPT-4o），运用 STAR 原则深入剖析您的技术架构亮点与量化业务指标。当前为 Demo 演示环境，已自动隔离私有 API Key。`,
            status: { sessionId: 'demo-session', messageCount: 2 }
          });
        }

        const copilot = PiSessionCopilot.getInstance();
        const reply = await copilot.prompt(message);
        const status = await copilot.getStatus();
        return sendJson(200, { code: 0, reply, status });
      } catch (e: any) {
        return sendJson(500, { code: -1, error: e.message });
      }
    });
      return;
    }

    // 触发上下文压缩 (Compaction，仅管理员)
    if (req.method === 'POST' && pathname === '/api/profile/chat/compact') {
      if (isDemo) {
        return sendJson(200, { code: 0, success: true, message: '【演示模式】上下文压缩已模拟完成' });
      }
      try {
        const copilot = PiSessionCopilot.getInstance();
        const resData = await copilot.compactContext();
        return sendJson(200, { code: 0, ...resData });
      } catch (e: any) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }

    // ============ 8. 书签/扩展采集 POST（必须授权） ============
    if (req.method === 'POST' && pathname === '/api/collect') {
      if (isDemo) {
        return sendJson(401, { code: -1, message: '未授权：采集扩展需要携带合法采集令牌或登录管理员账号' });
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const jobs: ExtendedJobPost[] = data.jobs || [];
          let approvedCount = 0;
          let detailCount = 0;
          let headhunterCount = 0;
          let storedOnlyCount = 0;
          let enrichedCount = 0;

          const tracker = (this.agent as any).tracker;
          await tracker.reload?.(); // 批处理前重载 KV 最新数据，防多实例旧快照互相覆盖
          const safety = new AntiRiskEngine();

          for (const job of jobs) {
            if (job.detailCaptured) detailCount++;
            if (job.sourceType === 'HEADHUNTER') headhunterCount++;

            // 已在库中的岗位：若本次带来更丰富的全量 JD（详情页深抓），合并富化并重跑初筛
            job.id = tracker.generateFingerprint(job.company, job.title, job.url);
            if (tracker.isAlreadyProcessed(job.id)) {
              try {
                if (await this.agent.enrichExistingJob(job)) enrichedCount++;
              } catch (e) {}
              continue;
            }

            // 每日配额防护：超过单平台日限额的岗位只入库去重，不做 LLM 深析与推送（防自动采集刷爆配额）
            const quota = safety.canProcess(job.platform);
            if (!quota.allowed) {
              if (!tracker.isAlreadyProcessed(job.id)) {
                tracker.registerDiscoveredJob(job);
                storedOnlyCount++;
              }
              continue;
            }

            const result = await this.agent.processSingleJob(job);
            if (result.approved) {
              approvedCount++;
              safety.recordAction(job.platform);
            }

            // 猎头帖入库后立即做一次免费的官方帖指纹匹配（不消耗 LLM）
            if (job.sourceType === 'HEADHUNTER') {
              try {
                const allRecords = tracker.getAllRecords();
                const resolution = await this.companyResolver.resolveHeadhunterJob(job, allRecords, false);
                const record = allRecords.find((r: any) => r.job.id === job.id);
                if (record) {
                  record.companyResolution = resolution;
                  tracker.updateStatus(job.id, record.status, '猎头帖指纹匹配完成', {});
                }
              } catch (e) {
                // 解析失败不影响采集主流程
              }
            }
          }

          const parts = [];
          parts.push(`成功提取 ${jobs.length} 个岗位（服务端指纹自动去重）`);
          if (detailCount > 0) parts.push(`含 ${detailCount} 个全量 JD 深度抓取`);
          if (enrichedCount > 0) parts.push(`${enrichedCount} 个已有岗位已用全量 JD 更新并重新初筛`);
          if (headhunterCount > 0) parts.push(`${headhunterCount} 个猎头帖已尝试指纹溯源`);
          if (storedOnlyCount > 0) parts.push(`${storedOnlyCount} 个超出今日配额仅入库`);
          parts.push(`${approvedCount} 个过筛推送！`);

          return sendJson(200, {
            code: 0,
            message: parts.join('，') ,
            approvedCount
          });
        } catch (e: any) {
          return sendJson(400, { code: -1, error: e.message });
        }
      });
      return;
    }

    // ============ 8.5 猎头帖真实企业深度解析（消耗 LLM，仅管理员） ============
    if (req.method === 'POST' && pathname.startsWith('/api/jobs/') && pathname.endsWith('/resolve-company')) {
      if (isDemo) {
        return sendJson(403, { code: -1, error: '演示模式下禁止调用 AI 企业溯源' });
      }
      const parts = pathname.split('/');
      const jobId = parts[3];
      try {
        const tracker = (this.agent as any).tracker;
        await tracker.ensureReady?.();
        const allRecords = tracker.getAllRecords();
        const record = allRecords.find((r: any) => r.job.id === jobId);
        if (!record) {
          return sendJson(404, { code: -1, error: '岗位不存在或已被清理' });
        }

        const resolution = await this.companyResolver.resolveHeadhunterJob(
          record.job as ExtendedJobPost,
          allRecords,
          true // 允许 AI 推断
        );
        record.companyResolution = resolution;
        await tracker.updateStatus(jobId, record.status, `真实企业解析: ${resolution.displayCompany}`, {});

        return sendJson(200, {
          code: 0,
          resolution,
          message: resolution.method === 'official_match'
            ? `✅ 已匹配到官方直发帖：${resolution.actualCompany}`
            : resolution.method === 'ai_inference'
              ? `✨ AI 推断真实企业：${resolution.actualCompany}（置信度 ${resolution.confidence}%）`
              : '⚠️ 证据不足，未能锁定具体企业'
        });
      } catch (e: any) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Job Hunter Server is healthy');
      return;
    }

    // 存储诊断：只报告变量名是否存在与当前存储模式，绝不返回任何密钥值
    // 未登录访客仅可见基本布尔信息；KV 写探针与变量名细节仅管理员可见（防匿名刷写 KV）
    if (pathname === '/api/diag/storage') {
      const { getKvEnvConfig } = await import('../../storage/index.js');
      const kvCfg = getKvEnvConfig();

      if (isDemo) {
        return sendJson(200, {
          code: 0,
          storageKind: getStorage().kind,
          llmEnvPresence: {
            LLM_API_KEY: Boolean(process.env.LLM_API_KEY),
            LLM_BASE_URL: Boolean(process.env.LLM_BASE_URL),
            LLM_MODEL: Boolean(process.env.LLM_MODEL)
          }
        });
      }

      let kvDetail: any = { roundtrip: 'skipped-local' };
      if (kvCfg) {
        try {
          // 原始 REST 探针（值固定 ping，无敏感信息）：捕获读写状态与响应体切片
          const probeKey = `diag/storage_probe_${Date.now()}`;
          const wResp = await fetch(`${kvCfg.url}/set/${encodeURIComponent(probeKey)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${kvCfg.token}`, 'Content-Type': 'text/plain' },
            body: 'ping'
          });
          const wBody = (await wResp.text()).slice(0, 80);
          const rResp = await fetch(`${kvCfg.url}/get/${encodeURIComponent(probeKey)}`, {
            headers: { Authorization: `Bearer ${kvCfg.token}` }
          });
          const rBody = (await rResp.text()).slice(0, 120);
          kvDetail = { wStatus: wResp.status, wBody, rStatus: rResp.status, rBody };
        } catch (e: any) {
          kvDetail = { roundtrip: `error: ${e.message}` };
        }
      }
      return sendJson(200, {
        code: 0,
        storageKind: getStorage().kind,
        kvSource: kvCfg?.source || null,
        prefixedKvVars: Object.keys(process.env).filter(k =>
          /KV_REST_API_URL$|UPSTASH_REDIS_REST_URL$/.test(k) && k !== 'KV_REST_API_URL' && k !== 'UPSTASH_REDIS_REST_URL'
        ),
        kvDetail,
        llmEnvPresence: {
          LLM_API_KEY: Boolean(process.env.LLM_API_KEY),
          LLM_BASE_URL: Boolean(process.env.LLM_BASE_URL),
          LLM_MODEL: Boolean(process.env.LLM_MODEL)
        },
        llmEffective: { hasKey: Boolean(this.llmClient.getConfig().apiKey) }
      });
    }

    // 静态资源回退（如果 public 目录下存在对应静态文件）
    const publicDir = path.resolve(process.cwd(), 'public');
    const publicStaticPath = path.resolve(publicDir, pathname.replace(/^\/+/, ''));
    if (publicStaticPath.startsWith(publicDir) && fs.existsSync(publicStaticPath) && !fs.statSync(publicStaticPath).isDirectory()) {
      const ext = path.extname(publicStaticPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(publicStaticPath));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.listen(this.port, () => {
        console.log(`\n=============================================================`);
        console.log(`🎯 [Job-Hunter OS] 现代化工作台已启动:`);
        console.log(`👉 Web 可视化看板:   http://127.0.0.1:${this.port}`);
        console.log(`👉 演示模式页面:     http://127.0.0.1:${this.port}/demo`);
        console.log(`👉 管理员登录入口:   http://127.0.0.1:${this.port}/login`);
        console.log(`=============================================================\n`);
        resolve();
      });
    });
  }
}
