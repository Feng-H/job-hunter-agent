import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobHunterCore } from '../../index.js';
import { JobPost } from '../../types/index.js';
import { LlmClient } from '../ai/LlmClient.js';
import { StandaloneJobHunter } from '../../standalone.js';
import { AntiRiskEngine } from '../safety/AntiRiskEngine.js';
import { PiSessionCopilot } from '../ai/PiSessionCopilot.js';

export class CollectorServer {
  private server: http.Server | null = null;
  private agent: JobHunterCore;
  private port: number;
  private llmClient: LlmClient;

  constructor(agent: JobHunterCore, port: number = 8765) {
    this.agent = agent;
    this.port = port;
    this.llmClient = new LlmClient();
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        // 允许跨域
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
        const pathname = url.pathname;

        // 1. 静态主页：Web 看板
        if (pathname === '/' || pathname === '/index.html') {
          const htmlPath = path.resolve(process.cwd(), 'public/index.html');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(htmlPath));
          return;
        }

        // 2. 静态页面：一键书签安装页
        if (pathname === '/setup') {
          const setupPath = path.resolve(process.cwd(), 'public/setup.html');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(setupPath));
          return;
        }

        // 3. 动态 JS
        if (pathname === '/bookmarklet.js') {
          const jsPath = path.resolve(process.cwd(), 'scripts/bookmarklet.js');
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(fs.readFileSync(jsPath));
          return;
        }

        // 4. API: 获取职位全量看板数据
        if (req.method === 'GET' && pathname === '/api/jobs') {
          const tracker = (this.agent as any).tracker;
          const records = tracker.getAllRecords();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, jobs: records }));
          return;
        }

        // 5. API: 对职位执行状态流转（确认投递 / 拒绝）
        if (req.method === 'POST' && pathname.startsWith('/api/jobs/') && pathname.endsWith('/action')) {
          const parts = pathname.split('/');
          const jobId = parts[3];
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            try {
              const { action, reason } = JSON.parse(body);
              this.agent.handleUserAction(jobId, action === 'APPROVED' ? 'APPROVED' : 'REJECTED', reason);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: 0, message: '操作成功' }));
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: -1, error: e.message }));
            }
          });
          return;
        }

        // 6. API: 手动触发 Chrome 极速扫描
        if (req.method === 'POST' && pathname === '/api/scan') {
          try {
            const standalone = new StandaloneJobHunter();
            const count = await standalone.runSingleScan();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 0, message: `扫描完成，本次共提取并推送了 ${count} 个高匹配职位！` }));
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, error: e.message }));
          }
          return;
        }

        // 7. API: 读取与保存 LLM 配置
        if (pathname === '/api/config/llm') {
          if (req.method === 'GET') {
            const cfg = this.llmClient.getConfig();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(cfg));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const newCfg = JSON.parse(body);
                this.llmClient.saveConfig(newCfg);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 0, message: 'LLM配置已更新' }));
              } catch (e: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, error: e.message }));
              }
            });
            return;
          }
        }

        // 8. API: 测试大模型连通性
        if (req.method === 'POST' && pathname === '/api/config/llm/test') {
          const testRes = await this.llmClient.testConnection();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(testRes));
          return;
        }

        // 9.7 API: 安全防风控盾牌状态与复位
        if (pathname === '/api/safety/status') {
          const safety = new AntiRiskEngine();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(safety.getState()));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/safety/reset') {
          const safety = new AntiRiskEngine();
          safety.resetCircuitBreaker();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, message: '风控熔断已成功复位！' }));
          return;
        }

        // 9.5 API: 读取与保存飞书配置
        if (pathname === '/api/config/feishu') {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              webhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
              appId: process.env.FEISHU_APP_ID || '',
              appSecret: process.env.FEISHU_APP_SECRET || ''
            }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                if (data.webhookUrl) process.env.FEISHU_WEBHOOK_URL = data.webhookUrl;
                if (data.appId) process.env.FEISHU_APP_ID = data.appId;
                if (data.appSecret) process.env.FEISHU_APP_SECRET = data.appSecret;

                // 持久化到 .env
                const envContent = `FEISHU_WEBHOOK_URL=${data.webhookUrl || ''}\nFEISHU_APP_ID=${data.appId || ''}\nFEISHU_APP_SECRET=${data.appSecret || ''}\n`;
                fs.writeFileSync(path.resolve(process.cwd(), '.env'), envContent, 'utf-8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 0, message: '飞书配置已更新' }));
              } catch (e: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, error: e.message }));
              }
            });
            return;
          }
        }

        if (req.method === 'POST' && pathname === '/api/config/feishu/test') {
          const feishu = (this.agent as any).feishu;
          const ok = await feishu.sendApprovalNotification(
            {
              id: 'test_demo',
              title: '智能制造与数字化方案专家（测试通知）',
              company: '湖南某高端装备制造集团',
              city: '长沙',
              workMode: 'ONSITE',
              salaryText: '25-40K·15薪',
              description: '测试卡片',
              url: 'https://www.liepin.com',
              platform: 'LIEPIN',
              publishOrActiveTime: '刚刚在线',
              discoveredAt: new Date().toISOString()
            },
            {
              passed: true,
              score: 95,
              reasons: ['时效优良：刚刚在线', '双休保障：周末双休', '技能匹配：EAM/MES/数字化'],
              breakdown: { skillMatch: 40, experienceMatch: 30, scheduleAndBenefits: 20, growthAndDomain: 5 }
            },
            {
              jobId: 'test_demo',
              company: '测试企业',
              jobTitle: '测试岗位',
              generatedAt: new Date().toISOString(),
              markdownContent: '# 测试简历',
              greetingMessage: '您好！这是一条测试卡片，说明飞书通道已完美打通！',
              keyMatchingPoints: ['测试亮点1', '测试亮点2']
            }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: ok, message: ok ? '推送成功' : '推送失败，请检查配置' }));
          return;
        }
        if (pathname === '/api/config/preferences') {
          const prefPath = path.resolve(process.cwd(), 'data/preferences/rules.json');
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(fs.readFileSync(prefPath));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const current = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
                if (data.salaryMin !== undefined) current.scenarios.onsite.salaryRange.min = data.salaryMin;
                if (data.commuteMax !== undefined) current.scenarios.onsite.maxCommuteMinutes = data.commuteMax;
                if (data.homeBase !== undefined) current.scenarios.onsite.homeBase = data.homeBase;
                if (data.targetCities !== undefined) current.scenarios.onsite.targetCities = data.targetCities;
                if (data.doubleWeekend !== undefined) current.strictRules.mustDoubleWeekend = data.doubleWeekend;
                if (data.excludeKeywords !== undefined) current.strictRules.excludeKeywords = data.excludeKeywords;
                if (data.excludeCompanies !== undefined) current.strictRules.excludeCompanies = data.excludeCompanies;
                fs.writeFileSync(prefPath, JSON.stringify(current, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 0, message: '偏好已更新' }));
              } catch (e: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, error: e.message }));
              }
            });
            return;
          }
        }

        // 10. API: 读取与保存全量主履历
        if (pathname === '/api/config/profile') {
          const profPath = path.resolve(process.cwd(), 'data/profile/master_profile.json');
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(fs.readFileSync(profPath));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                fs.writeFileSync(profPath, JSON.stringify(data, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 0, message: '主档案已更新' }));
              } catch (e: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, error: e.message }));
              }
            });
            return;
          }
        }

        // 10.5 API: AI 档案协同对话接口 (以 Pi 为底座管理增量上下文与会话持久化)
        if (pathname === '/api/profile/chat/history') {
          const copilot = PiSessionCopilot.getInstance();
          if (req.method === 'GET') {
            try {
              const history = await copilot.getHistory();
              const status = await copilot.getStatus();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: 0, history, status }));
            } catch (e: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: -1, error: e.message }));
            }
            return;
          }
          if (req.method === 'DELETE') {
            try {
              await copilot.resetSession();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: 0, message: 'Pi 会话已重置，已开启新上下文' }));
            } catch (e: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: -1, error: e.message }));
            }
            return;
          }
        }

        // 触发 Pi 原生上下文压缩 (Compaction)
        if (req.method === 'POST' && pathname === '/api/profile/chat/compact') {
          try {
            const copilot = PiSessionCopilot.getInstance();
            const resData = await copilot.compactContext();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 0, ...resData }));
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, error: e.message }));
          }
          return;
        }

        if (req.method === 'POST' && pathname === '/api/profile/chat') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', async () => {
            try {
              const { message } = JSON.parse(body);
              if (!message || !message.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: -1, error: '消息内容不能为空' }));
                return;
              }

              // 核心突破：直接投递至 Pi 原生 AgentSession，无需重复打包整段历史
              const copilot = PiSessionCopilot.getInstance();
              const reply = await copilot.prompt(message);
              const status = await copilot.getStatus();

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: 0, reply, status }));
            } catch (e: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: -1, error: e.message }));
            }
          });
          return;
        }

        // 11. 书签采集 POST
        if (req.method === 'POST' && pathname === '/api/collect') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const jobs: JobPost[] = data.jobs || [];
              let approvedCount = 0;
              for (const job of jobs) {
                const result = await this.agent.processSingleJob(job);
                if (result.approved) approvedCount++;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                code: 0,
                message: `成功提取 ${jobs.length} 个岗位，其中 ${approvedCount} 个已推送到飞书与看板！`,
                approvedCount
              }));
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ code: -1, error: e.message }));
            }
          });
          return;
        }

        if (pathname === '/healthz') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Job Hunter Collector Server is healthy');
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      this.server.listen(this.port, () => {
        console.log(`\n=============================================================`);
        console.log(`🎯 [Job-Hunter OS] 现代化交互工作台已在本地启动:`);
        console.log(`👉 Web 可视化看板:   http://127.0.0.1:${this.port}`);
        console.log(`👉 模型与系统设置:   http://127.0.0.1:${this.port}/#settings`);
        console.log(`👉 一键书签配置页:   http://127.0.0.1:${this.port}/setup`);
        console.log(`=============================================================\n`);
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
