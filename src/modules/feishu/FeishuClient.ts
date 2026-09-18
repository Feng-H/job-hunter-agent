import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobPost, FilterResult, TailoredResume } from '../../types/index.js';
import { CommutePlanner } from '../filter/CommutePlanner.js';
import { UrlValidator } from '../discovery/UrlValidator.js';
import { readJson } from '../../storage/index.js';

export interface FeishuConfig {
  webhookUrl?: string;
  appId?: string;
  appSecret?: string;
  receiveIdType?: 'open_id' | 'user_id' | 'email' | 'chat_id';
  receiveId?: string;
  serviceBaseUrl?: string;
}

export class FeishuNotifier {
  private config: FeishuConfig;
  private commutePlanner: CommutePlanner;
  private runtimeHost: string = "";

  constructor(config?: FeishuConfig) {
    this.config = config || {
      webhookUrl: process.env.FEISHU_WEBHOOK_URL,
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      serviceBaseUrl: process.env.FEISHU_SERVICE_BASE_URL || process.env.APP_URL || ""
    };
    this.commutePlanner = new CommutePlanner();
    this.reloadConfig().catch(() => {});
  }

  public setRuntimeHost(host: string): void {
    if (host && typeof host === "string") {
      this.runtimeHost = host.trim().replace(/\/+$/, "");
    }
  }

  public getBaseUrl(): string {
    if (this.config.serviceBaseUrl && this.config.serviceBaseUrl.trim()) {
      return this.config.serviceBaseUrl.trim().replace(/\/+$/, "");
    }
    if (process.env.FEISHU_SERVICE_BASE_URL && process.env.FEISHU_SERVICE_BASE_URL.trim()) {
      return process.env.FEISHU_SERVICE_BASE_URL.trim().replace(/\/+$/, "");
    }
    if (process.env.APP_URL && process.env.APP_URL.trim()) {
      return process.env.APP_URL.trim().replace(/\/+$/, "");
    }
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim().replace(/\/+$/, "")}`;
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, "")}`;
    }
    if (this.runtimeHost) {
      return this.runtimeHost;
    }
    return "https://job-hunter-agent-orpin.vercel.app";
  }

  public async reloadConfig(): Promise<FeishuConfig> {
    try {
      const stored = await readJson<FeishuConfig>('data/preferences/feishu.json', {
        webhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
        appId: process.env.FEISHU_APP_ID || '',
        appSecret: process.env.FEISHU_APP_SECRET || ''
      });
      this.config = {
        webhookUrl: stored.webhookUrl || process.env.FEISHU_WEBHOOK_URL || '',
        appId: stored.appId || process.env.FEISHU_APP_ID || '',
        appSecret: stored.appSecret || process.env.FEISHU_APP_SECRET || '',
        receiveIdType: stored.receiveIdType,
        receiveId: stored.receiveId,
        serviceBaseUrl: stored.serviceBaseUrl || process.env.FEISHU_SERVICE_BASE_URL || process.env.APP_URL || ''
      };
    } catch {
      // 保持当前配置
    }
    return this.config;
  }

  /**
   * 构建飞书交互卡片 Payload
   */
  public buildJobApprovalCard(job: JobPost, filter: FilterResult, tailor: TailoredResume) {
    const reasonsText = filter.reasons.map(r => `• ${r}`).join('\n');
    const highlightsText = tailor.keyMatchingPoints.map(p => `• ${p}`).join('\n');

    const platformBadgeMap: Record<string, string> = {
      BOSS: '🟢 Boss直聘',
      LIEPIN: '🟠 猎聘网',
      ZHAOPIN: '🔵 智联招聘',
      OFFICIAL_FOREIGN: '🌐 外企官方招聘/ATS',
      OFFICIAL: '🏢 企业官网直聘',
      ATS_FEISHU: '🪶 飞书招聘ATS',
      ATS_MOKA: '🔷 Moka官网直聘',
      ELEDUCK: '🦆 电鸭社区(远程)',
      V2EX: '💻 V2EX社区'
    };

    const platformBadge = platformBadgeMap[job.platform] || `🏷️ ${job.platform}`;

    // 计算通勤线路展示
    let commuteInfo = '🏡 居家办公 / 无需通勤';
    if (job.workMode !== 'REMOTE') {
      let homeBase = '设定常住地';
      try {
        const rulesPath = path.resolve(process.cwd(), 'data/preferences/rules.json');
        if (fs.existsSync(rulesPath)) {
          const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
          homeBase = rules.scenarios?.onsite?.homeBase || homeBase;
        }
      } catch (e) {}

      const commute = this.commutePlanner.estimateCommute(`${job.city} ${job.description} ${job.company}`, homeBase);
      commuteInfo = `起点【${homeBase}】➔ ${commute.transitSummary}`;
    }

    return {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          title: {
            tag: 'plain_text',
            content: `🎯 发现高匹配职位（${filter.score}分）｜ ${job.company}`
          },
          template: filter.score >= 85 ? 'green' : 'blue'
        },
        elements: [
          {
            tag: 'div',
            fields: [
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**🏢 目标企业**\n${job.company}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**💼 招聘岗位**\n${job.title}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**💰 薪资待遇**\n${job.salaryText || '面议（>=15K）'}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**📍 渠道来源 & 地点**\n${platformBadge} ｜ ${job.city}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**🕒 更新/活跃时效**\n${job.publishOrActiveTime || '近期 3 个月内活跃'}`
                }
              }
            ]
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🚇 通勤路线规划（<1.5h）：**\n${commuteInfo}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**📊 智能匹配与双休排查：**\n${reasonsText}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**💡 简历针对性契合亮点：**\n${highlightsText}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**💬 拟沟通打招呼话术：**\n> ${tailor.greetingMessage}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🔗 真实岗位落地页：** [👉 点击直达原始招聘页面查看详情](${job.url})`
            }
          },
          (() => {
            const baseUrl = this.getBaseUrl();
            const safeJobId = job.id || 'test_demo';
            const approveUrl = `${baseUrl}/api/feishu/action?action=APPROVE&jobId=${encodeURIComponent(safeJobId)}`;
            const tweakUrl = `${baseUrl}/api/feishu/action?action=REQUEST_TWEAK&jobId=${encodeURIComponent(safeJobId)}`;
            const rejectUrl = `${baseUrl}/api/feishu/action?action=REJECT&jobId=${encodeURIComponent(safeJobId)}`;

            return {
              tag: 'action',
              actions: [
                {
                  tag: 'button',
                  text: {
                    tag: 'plain_text',
                    content: '✅ 确认投递'
                  },
                  type: 'primary',
                  value: {
                    action: 'APPROVE',
                    jobId: safeJobId
                  },
                  url: approveUrl,
                  multi_url: {
                    url: approveUrl,
                    pc_url: approveUrl,
                    android_url: approveUrl,
                    ios_url: approveUrl
                  }
                },
                {
                  tag: 'button',
                  text: {
                    tag: 'plain_text',
                    content: '✏️ 修改简历要求'
                  },
                  type: 'default',
                  value: {
                    action: 'REQUEST_TWEAK',
                    jobId: safeJobId
                  },
                  url: tweakUrl,
                  multi_url: {
                    url: tweakUrl,
                    pc_url: tweakUrl,
                    android_url: tweakUrl,
                    ios_url: tweakUrl
                  }
                },
                {
                  tag: 'button',
                  text: {
                    tag: 'plain_text',
                    content: '❌ 不合适 / 拒绝'
                  },
                  type: 'danger',
                  value: {
                    action: 'REJECT',
                    jobId: safeJobId
                  },
                  url: rejectUrl,
                  multi_url: {
                    url: rejectUrl,
                    pc_url: rejectUrl,
                    android_url: rejectUrl,
                    ios_url: rejectUrl
                  }
                }
              ]
            };
          })()
        ]
      }
    };
  }

  /**
   * 详细发送卡片通知：返回具体状态与原因，避免静默失败或伪成功
   */
  public async sendNotification(
    job: JobPost,
    filter: FilterResult,
    tailor: TailoredResume,
    options?: { skipUrlCheck?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    await this.reloadConfig();

    if (!options?.skipUrlCheck) {
      const isLegit = await UrlValidator.verifyJobUrl(job.url, [job.title, job.company]);
      if (!isLegit) {
        const msg = `岗位 [${job.company}] ${job.title} 的落地页 (${job.url}) 无法打开或职位已下线，已被严格拦截，不向飞书推送！`;
        console.warn(`🛑 [推送拦截] ${msg}`);
        return { success: false, message: msg };
      }
    }

    const card = this.buildJobApprovalCard(job, filter, tailor);

    // 通道 1：优先使用飞书群自定义机器人 Webhook（推荐，零配置即用）
    if (this.config.webhookUrl && this.config.webhookUrl.trim()) {
      try {
        const resp = await fetch(this.config.webhookUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card)
        });
        const text = await resp.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch {}

        if (resp.ok && (data.code === 0 || data.StatusCode === 0)) {
          return { success: true, message: '测试卡片已成功推送到飞书群聊！' };
        }
        const errMsg = data.msg || data.StatusMessage || text.slice(0, 150) || `HTTP ${resp.status}`;
        console.error(`[FeishuNotifier] 飞书 Webhook 拒绝推送 (HTTP ${resp.status}):`, errMsg);
        return {
          success: false,
          message: `飞书 Webhook 推送失败 (Code ${data.code || data.StatusCode || resp.status}): ${errMsg}`
        };
      } catch (e: any) {
        console.error('[FeishuNotifier] Webhook 网络请求异常:', e);
        return { success: false, message: `网络连接异常: ${e.message}` };
      }
    }

    // 通道 2：自建应用凭据 (App ID + App Secret) OpenAPI 模式
    if (this.config.appId && this.config.appSecret) {
      try {
        const tokenResp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            app_id: this.config.appId.trim(),
            app_secret: this.config.appSecret.trim()
          })
        });
        const tokenData = await tokenResp.json() as any;
        if (!tokenResp.ok || tokenData.code !== 0) {
          const err = tokenData.msg || `HTTP ${tokenResp.status}`;
          return { success: false, message: `飞书自建应用鉴权失败: ${err}（请检查 App ID 与 Secret）` };
        }

        const tenantToken = tokenData.tenant_access_token;
        if (this.config.receiveId && this.config.receiveId.trim()) {
          const receiveType = this.config.receiveIdType || 'open_id';
          const msgResp = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveType}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Authorization': `Bearer ${tenantToken}`
            },
            body: JSON.stringify({
              receive_id: this.config.receiveId.trim(),
              msg_type: 'interactive',
              content: JSON.stringify(card.card)
            })
          });
          const msgData = await msgResp.json() as any;
          if (msgResp.ok && msgData.code === 0) {
            return { success: true, message: '已通过飞书自建应用机器人成功发送卡片！' };
          }
          return { success: false, message: `飞书应用消息发送失败 (Code ${msgData.code}): ${msgData.msg || '未知错误'}` };
        }

        return {
          success: false,
          message: '飞书自建应用 (App ID & Secret) 凭证校验成功！但未配置接收人 ID (receiveId)，机器人无法确定推送目标。\n\n💡 极力推荐：在飞书群聊中直接添加「自定义机器人」，获取 Webhook 地址填入保存，免配置接收人即可推送到群！'
        };
      } catch (e: any) {
        return { success: false, message: `飞书 OpenAPI 请求异常: ${e.message}` };
      }
    }

    // 未配置有效通道时的明确提示（修复之前的虚假成功问题）
    const helpMsg = '未配置有效的飞书发送通道。\n\n👉 快速配置步骤：\n1. 在任意飞书群的「群设置 -> 群机器人 -> 添加自定义机器人」；\n2. 复制生成的 Webhook 地址并填入保存；\n3. 注意：飞书开放平台的「长连接/WebSocket」模式仅用于事件下发，主动推送消息需使用 Webhook 地址。';
    console.warn(`⚠️ [FeishuNotifier] ${helpMsg}`);
    return { success: false, message: helpMsg };
  }

  /**
   * 发送卡片通知（保持原有返回 boolean 的签名向后兼容）
   */
  public async sendApprovalNotification(
    job: JobPost,
    filter: FilterResult,
    tailor: TailoredResume,
    options?: { skipUrlCheck?: boolean }
  ): Promise<boolean> {
    const res = await this.sendNotification(job, filter, tailor, options);
    return res.success;
  }
}
