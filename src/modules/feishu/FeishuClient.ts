import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobPost, FilterResult, TailoredResume } from '../../types/index.js';
import { CommutePlanner } from '../filter/CommutePlanner.js';
import { UrlValidator } from '../discovery/UrlValidator.js';

export interface FeishuConfig {
  webhookUrl?: string;
  appId?: string;
  appSecret?: string;
}

export class FeishuNotifier {
  private config: FeishuConfig;
  private commutePlanner: CommutePlanner;

  constructor(config?: FeishuConfig) {
    this.config = config || {
      webhookUrl: process.env.FEISHU_WEBHOOK_URL,
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET
    };
    this.commutePlanner = new CommutePlanner();
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
          {
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
                  jobId: job.id
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
                  jobId: job.id
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
                  jobId: job.id
                }
              }
            ]
          }
        ]
      }
    };
  }

  /**
   * 发送卡片通知（带真实性校验拦截）
   */
  public async sendApprovalNotification(job: JobPost, filter: FilterResult, tailor: TailoredResume): Promise<boolean> {
    // 强制严格校验：页面是否真实存在、是否已下线、是否为死链
    const isLegit = await UrlValidator.verifyJobUrl(job.url, [job.title, job.company]);
    if (!isLegit) {
      console.warn(`🛑 [推送拦截] 岗位 [${job.company}] ${job.title} 的落地页 (${job.url}) 无法打开或职位已下线，已被严格拦截，不向飞书推送！`);
      return false;
    }

    const card = this.buildJobApprovalCard(job, filter, tailor);

    if (!this.config.webhookUrl) {
      console.log('\n================== 🔔 飞书交互卡片模拟推送 ==================');
      console.log(`[企业/职位]: ${job.company} · ${job.title} (${job.salaryText})`);
      console.log(`[工作模式]: ${job.workMode} ｜ 地点: ${job.city}`);
      console.log(`[匹配评分]: ${filter.score} 分`);
      console.log(`[匹配原因]:\n${filter.reasons.map(r => '  - ' + r).join('\n')}`);
      console.log(`[打招呼话术]:\n  "${tailor.greetingMessage}"`);
      console.log(`[定制简历路径]: ${tailor.snapshotPath}`);
      console.log(`[交互操作]: [1] 确认投递  [2] 修改简历  [3] 拒绝岗位`);
      console.log('============================================================\n');
      return true;
    }

    try {
      const resp = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card)
      });
      const data = await resp.json();
      return (data as any).code === 0 || (data as any).StatusCode === 0;
    } catch (e) {
      console.error('[FeishuNotifier] 发送卡片失败:', e);
      return false;
    }
  }
}
