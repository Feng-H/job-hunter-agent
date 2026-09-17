export type WorkMode = 'REMOTE' | 'ONSITE' | 'HYBRID';

export type ApplicationStatus =
  | 'DISCOVERED'          // 初次发现
  | 'FILTERED_OUT'        // 硬规则/匹配度过低过滤
  | 'PENDING_REVIEW'      // 已推送到飞书，等待用户确认
  | 'REJECTED_BY_USER'    // 用户点击拒绝（记录原因）
  | 'APPROVED'            // 用户点击同意投递
  | 'APPLIED'             // 已执行投递/打招呼
  | 'COMMUNICATING'       // HR回复/沟通中
  | 'INTERVIEWING'        // 面试中
  | 'OFFER'               // 收到 Offer
  | 'ARCHIVED';           // 归档

export interface BasicInfo {
  name: string;
  title: string;
  yearsOfExperience: number;
  phone: string;
  email: string;
  location: string;
  workModePreference: string;
  education: {
    school: string;
    degree: string;
    major: string;
  };
}

export interface WorkExperience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  highlights: Array<{
    module: string;
    details: string;
  }>;
}

export interface MasterProfile {
  basicInfo: BasicInfo;
  summary: string[];
  workExperiences: WorkExperience[];
  skills: {
    aiAndDigitalization: string[];
    industrialEngineering: string[];
    projectManagement: string[];
    languages: string[];
    certifications: Array<{
      title: string;
      org: string;
      date: string;
      note?: string;
    }>;
  };
}

export type PlatformType =
  | 'BOSS'
  | 'LAGOU'
  | 'LIEPIN'
  | 'ZHAOPIN'
  | 'OFFICIAL_FOREIGN'
  | 'ATS_FEISHU'
  | 'ATS_MOKA'
  | 'OFFICIAL'
  | 'ELEDUCK'
  | 'V2EX'
  | 'OTHER';

export interface JobPost {
  id: string;                      // 唯一ID（URL或平台ID哈希）
  title: string;                   // 职位名
  company: string;                 // 公司名（猎头帖时可能为猎头方或代称）
  city: string;                    // 城市
  workMode: WorkMode;              // 远程/线下/混合
  salaryText: string;              // 薪资文本描述（如 25-35K·14薪）
  salaryMin?: number;              // 换算月薪下限（元）
  salaryMax?: number;              // 换算月薪上限（元）
  description: string;             // 岗位职责与任职要求 JD 全文
  url: string;                     // 原始链接
  platform: PlatformType;
  publishOrActiveTime?: string;    // 发布或HR活跃时间（如：今日活跃、3天前、2026-08-10等）
  hrName?: string;
  hrTitle?: string;
  discoveredAt: string;            // ISO 时间
  sourceType?: 'HEADHUNTER' | 'COMPANY_DIRECT';  // 猎头代发 / 企业官方直发
  detailCaptured?: boolean;        // 是否已从详情页抓取全量 JD
}

/** 猎头帖真实企业解析结果 */
export interface CompanyResolution {
  actualCompany: string | null;                 // 解析出的真实招聘企业
  method: 'official_match' | 'ai_inference' | 'as_is';
  confidence: number;                           // 0-100
  explanation: string;
  matchedOfficialJobId?: string;                // 匹配到的官方直发职位 ID
  resolvedAt: string;
}

export interface FilterResult {
  passed: boolean;
  score: number;                   // 0 - 100
  matchedScenario?: string;        // 'remote' | 'onsite'
  reasons: string[];               // 匹配理由或淘汰理由
  breakdown: {
    skillMatch: number;
    experienceMatch: number;
    scheduleAndBenefits: number;
    growthAndDomain: number;
  };
}

export interface TailoredResume {
  jobId: string;
  company: string;
  jobTitle: string;
  generatedAt: string;
  markdownContent: string;
  greetingMessage: string;         // 打招呼话术（发给HR的针对性短消息）
  keyMatchingPoints: string[];     // 核心契合点摘要
  snapshotPath?: string;           // 保存的文件路径
}

export interface TrackedJobRecord {
  job: JobPost;
  status: ApplicationStatus;
  statusHistory: Array<{
    status: ApplicationStatus;
    timestamp: string;
    note?: string;
  }>;
  filterResult?: FilterResult;
  tailoredResume?: TailoredResume;
  companyResolution?: CompanyResolution;  // 猎头帖真实企业解析结果
  userFeedback?: {
    action: 'APPROVED' | 'REJECTED' | 'REQUEST_TWEAK';
    reason?: string;
    tweakInstructions?: string;
    timestamp: string;
  };
  lastUpdated: string;
}

export interface PreferenceRules {
  strictRules: {
    mustDoubleWeekend: boolean;
    disallowedWorkSchedules: string[];
    maxStaleMonths?: number;        // 职位发布/活跃最大允许月数（默认 3，0 表示不限）
    excludeKeywords: string[];
    excludeCompanies: string[];
    targetDomains?: string[];       // 期望行业领域赛道（如：AI, 智能制造, 互联网, 软件等）
  };
  scenarios: {
    remote: {
      enabled: boolean;
      name: string;
      targetRoles: string[];
      preferredLocations: string[];
      salaryRange: {
        min: number;
        max: number;
        currency: string;
        allowUsd?: boolean;
        minUsd?: number;
      };
      workMode: WorkMode;
    };
    onsite: {
      enabled: boolean;
      name: string;
      homeBase?: string;
      maxCommuteMinutes?: number;
      preferredCommute?: string;
      targetCities: string[];
      targetRoles: string[];
      salaryRange: {
        min: number;
        max: number;
        currency: string;
      };
      workMode: WorkMode;
    };
  };
  scoringThresholds: {
    minScoreToNotify: number;
    weights: {
      skillMatch: number;
      experienceMatch: number;
      scheduleAndBenefits: number;
      growthAndDomain: number;
    };
  };
}

export interface FeedbackMemory {
  rejectedJobIds: string[];
  negativeKeywords: string[];
  negativeCompanyKeywords: string[];
  resumeTweaks: Array<{
    targetJobTitle: string;
    instructions: string;
    timestamp: string;
  }>;
  historyFeedback: Array<{
    jobId: string;
    company: string;
    jobTitle: string;
    action: string;
    reason?: string;
    timestamp: string;
  }>;
}
