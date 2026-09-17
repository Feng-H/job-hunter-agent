import { JobPost } from '../../types/index.js';

export interface PublicAtsPortal {
  companyName: string;
  atsType: 'FEISHU_ATS' | 'MOKA_ATS' | 'OFFICIAL_CAREERS';
  portalUrl: string;
  category: string;
  description: string;
}

/**
 * 重点收录长沙本地知名企业公开 ATS 与外企中国招聘通道
 * 特点：完全公开、合法合规、绝不需要登录候选人个人账号，天然零封号风控！
 */
export const CHANGSHA_PUBLIC_PORTALS: PublicAtsPortal[] = [
  {
    companyName: '万兴科技 (Wondershare)',
    atsType: 'FEISHU_ATS',
    portalUrl: 'https://wondershare.jobs.feishu.cn/index',
    category: 'AI与数字创意龙头 / 长沙全球研发中心',
    description: '全员严格双休，长沙中电软件园总部基地，重金招聘 AI 产品经理与架构师。'
  },
  {
    companyName: '中联重科中科云谷 (ZValley)',
    atsType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.zvalley.com/careers',
    category: '高端装备与工业互联网龙头',
    description: '国家级双跨工业互联网平台，主导大型装备制造数字化与工业 AI。'
  },
  {
    companyName: '博世中国 (Bosch 长沙)',
    atsType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://careers.smartrecruiters.com/BoschGroup',
    category: '德资世界灯塔工厂 / 汽车互联电子',
    description: '工业 4.0 示范基地，精益制造与数字化设备管理岗位极其规范，双休。'
  },
  {
    companyName: '索恩格汽车部件 (SEG Automotive)',
    atsType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.seg-automotive.cn',
    category: '德资全球第二大研发与制造基地（长沙经开区）',
    description: '原博世核心事业部，全套德企工程师文化与合规保障。'
  },
  {
    companyName: '巴斯夫杉杉 (BASF Shanshan)',
    atsType: 'OFFICIAL_CAREERS',
    portalUrl: 'https://www.basf-shanshan.com',
    category: '中德合资新能源正极材料龙头',
    description: '德资控股，长沙望城总部，严格双休与合规。'
  }
];

export class PublicAtsRadar {
  /**
   * 获取所有零风控监控门户
   */
  public getPublicPortals(): PublicAtsPortal[] {
    return CHANGSHA_PUBLIC_PORTALS;
  }
}
