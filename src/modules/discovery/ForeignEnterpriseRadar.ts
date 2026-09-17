import { JobPost } from '../../types/index.js';

export interface EnterpriseConfig {
  name: string;
  category: 'GERMAN' | 'US' | 'JAPANESE' | 'GLOBAL_TOP500' | 'LOCAL_GIANT';
  changshaSiteName: string;
  careerUrl: string;
  atsType: 'SMART_RECRUITERS' | 'SUCCESS_FACTORS' | 'WORKDAY' | 'CUSTOM' | 'LIEPIN_OFFICIAL';
  description: string;
}

/**
 * 长沙重点外企与合资高端制造基地雷达配置库
 * 特点：严格双休、五险一金规范、合规性极高、看重工程/数字化底蕴与英语能力
 */
export const CHANGSHA_FOREIGN_ENTERPRISES: EnterpriseConfig[] = [
  {
    name: '博世中国 (Bosch)',
    category: 'GERMAN',
    changshaSiteName: '博世汽车部件（长沙）有限公司 / 博世互联工业',
    careerUrl: 'https://careers.smartrecruiters.com/BoschGroup',
    atsType: 'SMART_RECRUITERS',
    description: '全球工业4.0世界灯塔工厂，拥有庞大的汽车电子、电机与互联制造研发中心，严格双休，福利极高。'
  },
  {
    name: '舍弗勒大中华区 (Schaeffler)',
    category: 'GERMAN',
    changshaSiteName: '舍弗勒智能驾驶科技（长沙）有限公司 / 大中华区第二研发中心',
    careerUrl: 'https://jobs.schaeffler.com',
    atsType: 'SUCCESS_FACTORS',
    description: '德国轴承与汽车零部件巨头，在长沙设立智能驾驶与线控底盘全球研发中心，严格五天工作制。'
  },
  {
    name: '巴斯夫杉杉 (BASF Shanshan)',
    category: 'GERMAN',
    changshaSiteName: '巴斯夫杉杉电池材料有限公司（望城总部/基地）',
    careerUrl: 'https://www.basf.com/cn/zh/careers.html',
    atsType: 'CUSTOM',
    description: '德资控股（51%），全球动力电池正极材料龙头，长沙核心基地，完全遵守外企合规双休体系。'
  },
  {
    name: '索恩格汽车部件 (SEG Automotive)',
    category: 'GERMAN',
    changshaSiteName: '索恩格汽车部件（中国）有限公司（长沙经开区）',
    careerUrl: 'https://www.liepin.com/zhaopin/?key=%E7%B4%A2%E6%81%A9%E6%A0%BC&city=190020',
    atsType: 'CUSTOM',
    description: '原德国博世起动机与发电机事业部，全球第二大研发与制造中心设在长沙，德资工程师文化，周末双休。'
  },
  {
    name: '大陆汽车系统 (Continental)',
    category: 'GERMAN',
    changshaSiteName: '大陆汽车系统（长沙）分公司 / 联络处',
    careerUrl: 'https://www.continental-jobs.com',
    atsType: 'CUSTOM',
    description: '德国知名汽车电子与工业系统巨头。'
  },
  {
    name: '西门子工业自动化 / 数字化 (Siemens)',
    category: 'GERMAN',
    changshaSiteName: '西门子（中国）有限公司长沙办事处 / 数字化工业集团',
    careerUrl: 'https://jobs.siemens.com',
    atsType: 'WORKDAY',
    description: '工业软件、PLC、MES与数字化孪生领导者，在湖南有大量工业客户解决方案团队。'
  },
  {
    name: '施耐德电气 (Schneider Electric)',
    category: 'GLOBAL_TOP500',
    changshaSiteName: '施耐德电气（中国）长沙分公司',
    careerUrl: 'https://careers.se.com',
    atsType: 'CUSTOM',
    description: '能源管理与自动化数字化转型专家。'
  },
  {
    name: '德国卓伯根集团 (Zhubogen)',
    category: 'GERMAN',
    changshaSiteName: '卓伯根中国总部（长沙洋湖）',
    careerUrl: 'http://www.zhubogen.cn',
    atsType: 'CUSTOM',
    description: '德国零售与商业集团中国区总部，驻扎长沙。'
  }
];

export class ForeignEnterpriseRadar {
  /**
   * 获取长沙重点外企库
   */
  public getTargetEnterprises(): EnterpriseConfig[] {
    return CHANGSHA_FOREIGN_ENTERPRISES;
  }
}
