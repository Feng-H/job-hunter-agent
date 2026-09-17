import { JobPost } from '../../types/index.js';
import { LlmClient } from '../ai/LlmClient.js';

export interface RegionalCompanyPortal {
  companyName: string;
  city: string;
  industry: string;
  portalType: 'FEISHU_ATS' | 'MOKA_ATS' | 'BEISEN_ATS' | 'OFFICIAL_CAREERS' | 'WORKDAY';
  portalUrl: string;
  description: string;
  doubleWeekend: boolean; // 是否双休标杆
  directApplyAvailable: boolean; // 是否无需登录直接查阅投递
}

/**
 * 重点城市精选高价值官网与公开 ATS 门户知识库（天然 0 风控）
 */
export const PRESET_REGIONAL_PORTALS: RegionalCompanyPortal[] = [
  // ============ 长沙重点企业 ============
  {
    companyName: '万兴科技 (Wondershare)',
    city: '长沙',
    industry: 'AI与数字创意软件',
    portalType: 'FEISHU_ATS',
    portalUrl: 'https://wondershare.jobs.feishu.cn/index',
    description: 'AIGC 软件龙头，全球研发中心落地长沙，技术栈以 AI/全栈为主，严格双休。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '博世长沙 (Bosch 长沙)',
    city: '长沙',
    industry: '汽车电子与智能制造',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://careers.smartrecruiters.com/BoschGroup',
    description: '世界级工业 4.0 灯塔工厂，数字化转型标杆，福利与工作制极其规范。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '中科云谷 (中联重科工业互联网)',
    city: '长沙',
    industry: '工业互联网与智能制造',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.zvalley.com/careers',
    description: '国家级双跨工业互联网平台，主导工程机械大型数字化与工业 AI。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '索恩格汽车部件 (SEG Automotive)',
    city: '长沙',
    industry: '德资高端制造与新能源',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.seg-automotive.cn',
    description: '原博世起动机与发电机事业部，德企文化，双休与合规。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '巴斯夫杉杉 (BASF Shanshan)',
    city: '长沙',
    industry: '新能源正极材料',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.basf-shanshan.com',
    description: '德资巨头控股，研发中心位于长沙望城，高规格环保与工作制保障。',
    doubleWeekend: true,
    directApplyAvailable: true
  },

  // ============ 上海重点标杆企业 ============
  {
    companyName: '微创医疗 (MicroPort)',
    city: '上海',
    industry: '高端医疗器械与数字化',
    portalType: 'MOKA_ATS',
    portalUrl: 'https://app.mokahr.com/apply/microport',
    description: '张江高科医疗器械巨头，软件中心与数字化研发团队规模庞大。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '联合利华中国 (Unilever)',
    city: '上海',
    industry: '快消与全球数字化中心',
    portalType: 'WORKDAY',
    portalUrl: 'https://careers.unilever.com/china',
    description: '知名外企中国总部，倡导 Agile 工作制与混合办公，双休不打卡。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '蔚来汽车 (NIO)',
    city: '上海',
    industry: '智能电动汽车 / 自动驾驶',
    portalType: 'FEISHU_ATS',
    portalUrl: 'https://nio.jobs.feishu.cn',
    description: '智能座舱、云端架构与数字化系统岗位，公开 ATS 直接检索投递。',
    doubleWeekend: true,
    directApplyAvailable: true
  },

  // ============ 深圳/广州重点企业 ============
  {
    companyName: '腾讯音乐 (TME)',
    city: '深圳',
    industry: '数字音乐与互动娱乐',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://join.tencentmusic.com',
    description: '官方招聘主页，支持全量岗位直投与进度查阅。',
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: '大疆创新 (DJI)',
    city: '深圳',
    industry: '无人机与智能机器人',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://we.dji.com',
    description: '全球创新硬件领跑者，官网招聘开放透明。',
    doubleWeekend: true,
    directApplyAvailable: true
  },

  // ============ 全国远程友好标杆 ============
  {
    companyName: 'GitLab / Remote 开放企业群',
    city: '全国远程',
    industry: '开源软件与云原生工具',
    portalType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://about.gitlab.com/jobs',
    description: '全员全远程办公标杆，美元或本地化薪酬体系。',
    doubleWeekend: true,
    directApplyAvailable: true
  }
];

export class RegionalCareerRadar {
  private llmClient: LlmClient;

  constructor() {
    this.llmClient = new LlmClient();
  }

  /**
   * 根据目标城市筛选企业招聘门户
   * 优先匹配本地精选企业库；若为其他城市或需扩展，调用 AI 动态推荐该区域名企官网
   */
  public async getPortalsForCity(targetCity: string, industryHint?: string): Promise<{
    city: string;
    portals: RegionalCompanyPortal[];
    source: 'preset' | 'ai_enhanced';
  }> {
    const cleanCity = (targetCity || '').trim();
    if (!cleanCity) {
      return { city: '全国精选', portals: PRESET_REGIONAL_PORTALS, source: 'preset' };
    }

    // 1. 本地精选匹配
    const matched = PRESET_REGIONAL_PORTALS.filter(p =>
      p.city.includes(cleanCity) || cleanCity.includes(p.city)
    );

    if (matched.length >= 3) {
      return { city: cleanCity, portals: matched, source: 'preset' };
    }

    // 2. 如果预置库不足，调用 LLM 动态挖掘该城市的标杆企业与招聘门户
    try {
      const dynamicPortals = await this.discoverCompanyPortalsViaLlm(cleanCity, industryHint);
      const combined = [...matched, ...dynamicPortals];
      return { city: cleanCity, portals: combined, source: 'ai_enhanced' };
    } catch (e) {
      return { city: cleanCity, portals: matched.length > 0 ? matched : PRESET_REGIONAL_PORTALS, source: 'preset' };
    }
  }

  /**
   * 利用 LLM 生成目标城市的高价值企业官方招聘清单
   */
  private async discoverCompanyPortalsViaLlm(city: string, industryHint?: string): Promise<RegionalCompanyPortal[]> {
    const promptSystem = `你是一位专注于中国各城市优质雇主与名企招聘渠道的职业顾问。
请根据用户输入的城市【${city}】${industryHint ? `与行业【${industryHint}】` : ''}，列出该城市最值得求职者投递的 5 家标杆知名企业（优先考虑外企研发中心、行业上市龙头、严格双休合规企业、拥有官方公开招聘 ATS 的企业）。
请输出严格的 JSON 数组格式（不要包含 markdown 代码块）：
[
  {
    "companyName": "公司名称",
    "city": "${city}",
    "industry": "主营业务/行业赛道",
    "portalType": "FEISHU_ATS",
    "portalUrl": "https://company.jobs.feishu.cn 或官网招聘网址",
    "description": "企业在当地的研发规模、业务重点与工作制口碑",
    "doubleWeekend": true,
    "directApplyAvailable": true
  }
]`;

    const reply = await this.llmClient.complete(`请检索并推荐【${city}】的标杆雇主招聘官网`, promptSystem);
    const match = reply.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as RegionalCompanyPortal[];
  }
}
