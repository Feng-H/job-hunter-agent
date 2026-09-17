import { MasterProfile, TrackedJobRecord, JobPost, TailoredResume } from '../../types/index.js';

export const DEMO_PROFILE: MasterProfile = {
  basicInfo: {
    name: '李明 (Demo 演示档案)',
    title: '资深全栈架构师 / AI 工程化专家',
    yearsOfExperience: 8,
    phone: '138****8888',
    email: 'demo@jobhunter-os.local',
    location: '上海 / 远程',
    workModePreference: '远程优先 / 混合办公',
    education: {
      school: '知名重点大学 (示例)',
      degree: '硕士',
      major: '软件工程与分布式系统'
    }
  },
  summary: [
    '8年全栈系统架构与高并发后端研发经验，深耕 TypeScript / Node.js / Go 与现代云原生技术栈。',
    '主导过多款大模型 Agent 智能体系统与企业级工作流引擎的落地，具备落地级 Prompt 与 RAG 实战架构能力。',
    '注重工程规范与自动化工具链设计，推崇精益研发与高质量交付。'
  ],
  workExperiences: [
    {
      company: '某知名科技独角兽（演示公司）',
      role: '资深架构师 / Tech Lead',
      startDate: '2021.03',
      endDate: '至今',
      description: '负责核心云平台架构演进及 AI 智能助理系统的研发与工程化落地。',
      highlights: [
        {
          module: 'AI Agent 平台研发',
          details: '主导研发基于 LLM 与工作流编排的自动化助手系统，端到端调用延迟降低 40%，月均自动化执行超 20 万次。'
        },
        {
          module: '云原生高可用架构',
          details: '重构核心 API 网关与服务调度层，在千万级日活流量下达成 99.99% 可用性。'
        }
      ]
    },
    {
      company: '某互联网集团（演示公司）',
      role: '高级全栈工程师',
      startDate: '2018.07',
      endDate: '2021.02',
      description: '主导中后台低代码看板体系与核心业务微服务的开发与性能调优。',
      highlights: [
        {
          module: '看板系统研发',
          details: '从零设计企业级高实时看板系统，支持海量任务拖拽协同与多维权限管控。'
        }
      ]
    }
  ],
  skills: {
    aiAndDigitalization: ['TypeScript', 'Node.js', 'Go', 'React', 'Next.js', 'LLM Agent', 'LangChain', 'RAG', 'PostgreSQL', 'Redis', 'Docker'],
    industrialEngineering: ['系统架构', '高并发微服务', 'CI/CD 自动化', '性能调优'],
    projectManagement: ['敏捷开发 Scrum', '技术评审规范', '跨团队协同'],
    languages: ['中文 (母语)', '英语 (专业读写/工作交流)'],
    certifications: [
      {
        title: 'AWS Certified Solutions Architect',
        org: 'Amazon Web Services',
        date: '2023.05'
      }
    ]
  }
};

export const DEMO_JOBS: TrackedJobRecord[] = [
  {
    job: {
      id: 'demo-job-1',
      title: 'AI 全栈架构师 (Remote)',
      company: 'NextGen Global AI (示例外企)',
      city: '全国远程',
      workMode: 'REMOTE',
      salaryText: '35K-50K·15薪',
      salaryMin: 35000,
      salaryMax: 50000,
      description: '我们正在寻找优秀的 AI 全栈架构师。主要职责包括构建下一代企业级自主 Agent 协同系统，集成 LLM、向量检索与自适应工作流。要求熟练掌握 TypeScript、Node.js，有知名开源贡献或 Agent 研发经验优先，双休，弹性不打卡。',
      url: 'https://example.com/demo-job-1',
      platform: 'OFFICIAL_FOREIGN',
      publishOrActiveTime: '2小时前活跃',
      hrName: 'Sarah (Recruiter)',
      hrTitle: 'Head of Talent',
      discoveredAt: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    status: 'OFFER',
    statusHistory: [
      { status: 'DISCOVERED', timestamp: '2026-09-01T08:00:00Z', note: '书签采集器自动捕获' },
      { status: 'APPROVED', timestamp: '2026-09-02T09:30:00Z', note: 'AI 匹配度 94 分，用户确认投递' },
      { status: 'APPLIED', timestamp: '2026-09-02T10:00:00Z', note: '已发送定制简历与量化求职信' },
      { status: 'COMMUNICATING', timestamp: '2026-09-04T14:20:00Z', note: 'HR 发起首轮电话沟通' },
      { status: 'INTERVIEWING', timestamp: '2026-09-08T15:00:00Z', note: '完成两轮技术架构深入面试' },
      { status: 'OFFER', timestamp: '2026-09-14T11:00:00Z', note: '收到正式 Offer' }
    ],
    filterResult: {
      passed: true,
      score: 94,
      matchedScenario: 'remote',
      reasons: [
        '【技术匹配】要求 TypeScript、Node.js 与 Agent 架构，与候选人主背景完美契合（+40分）',
        '【工作模式】纯远程 + 弹性制，符合首选场景诉求（+25分）',
        '【薪资待遇】35K-50K 处于理想区间且15薪待遇优渥（+29分）'
      ],
      breakdown: {
        skillMatch: 40,
        experienceMatch: 25,
        scheduleAndBenefits: 15,
        growthAndDomain: 14
      }
    },
    tailoredResume: {
      jobId: 'demo-job-1',
      company: 'NextGen Global AI (示例外企)',
      jobTitle: 'AI 全栈架构师 (Remote)',
      generatedAt: '2026-09-02T09:30:00Z',
      greetingMessage: 'Sarah 您好！看到贵司正在寻找 AI 全栈架构师。我有 8 年高可用全栈架构经验，曾主导企业级自主 Agent 引擎研发（月调度超20万次）。对贵司分布式 Agent 协同方向深感兴趣，附上量身定制的履历，期待与您深入交流！',
      keyMatchingPoints: [
        '拥有 8 年全栈系统与分布式云架构研发落地经验',
        '深度主导过 LLM Agent 平台与企业级工作流引擎架构设计',
        '全远程及跨时区协同实践经验丰富，英文流利'
      ],
      markdownContent: `# 李明 - AI 全栈架构师定制简历\n\n**核心定位**：资深全栈架构师 / AI 工程化专家（8年）\n**期望职位**：AI 全栈架构师 (Remote)\n\n### 核心契合亮点\n- **Agent 平台工程化**：自研自主 Agent 编排调度平台，优化 LLM 链路延迟 40%\n- **技术栈纯正**：TypeScript / Node.js / Go / 云原生高可用微服务\n- **分布式协作**：长期全远程与跨国团队协同交付经验\n`
    },
    lastUpdated: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    job: {
      id: 'demo-job-2',
      title: '资深全栈工程师 (Node/React)',
      company: '智能云图科技有限公司 (示例企业)',
      city: '上海 (支持每周2天远程)',
      workMode: 'HYBRID',
      salaryText: '30K-45K·14薪',
      salaryMin: 30000,
      salaryMax: 45000,
      description: '负责核心企业协同 SaaS 产品的全栈架构与开发。要求熟练掌握 TypeScript、Node.js 服务端、React 前端架构，对高并发与系统稳定性有深入认知。五险一金全额，双休不加班。',
      url: 'https://example.com/demo-job-2',
      platform: 'BOSS',
      publishOrActiveTime: '刚刚活跃',
      hrName: '王经理',
      hrTitle: '技术招聘总监',
      discoveredAt: new Date(Date.now() - 3600000 * 5).toISOString()
    },
    status: 'INTERVIEWING',
    statusHistory: [
      { status: 'DISCOVERED', timestamp: '2026-09-05T10:00:00Z' },
      { status: 'APPROVED', timestamp: '2026-09-06T11:00:00Z' },
      { status: 'APPLIED', timestamp: '2026-09-06T11:10:00Z' },
      { status: 'COMMUNICATING', timestamp: '2026-09-07T09:30:00Z' },
      { status: 'INTERVIEWING', timestamp: '2026-09-11T14:00:00Z', note: '完成终面，等待定级' }
    ],
    filterResult: {
      passed: true,
      score: 89,
      matchedScenario: 'onsite',
      reasons: [
        '【技能栈高度匹配】Node.js + React + TypeScript 全技术栈对齐',
        '【工作制健康】严格双休，混合办公模式'
      ],
      breakdown: {
        skillMatch: 38,
        experienceMatch: 23,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    job: {
      id: 'demo-job-3',
      title: 'AI 产品技术研发专家',
      company: '某一线人工智能创新平台',
      city: '北京 / 深圳 / 远程',
      workMode: 'REMOTE',
      salaryText: '40K-60K',
      salaryMin: 40000,
      salaryMax: 60000,
      description: '探索下一代大模型赋能工具产品，负责 Agent 工具链架构。要求对主流大模型 API、Function Call、Prompt 工程与多智能体系统有深入理解。',
      url: 'https://example.com/demo-job-3',
      platform: 'ATS_FEISHU',
      publishOrActiveTime: '昨日活跃',
      hrName: '张敏',
      hrTitle: 'HRBP',
      discoveredAt: new Date(Date.now() - 3600000 * 20).toISOString()
    },
    status: 'COMMUNICATING',
    statusHistory: [
      { status: 'DISCOVERED', timestamp: '2026-09-10T09:00:00Z' },
      { status: 'APPROVED', timestamp: '2026-09-10T10:00:00Z' },
      { status: 'APPLIED', timestamp: '2026-09-10T10:15:00Z' },
      { status: 'COMMUNICATING', timestamp: '2026-09-12T16:00:00Z', note: 'HR 已推给业务总监初筛通过' }
    ],
    filterResult: {
      passed: true,
      score: 91,
      matchedScenario: 'remote',
      reasons: ['【AI 赛道前沿】岗位契合个人 AI Agent 方向', '【薪资上限高】可达 60K'],
      breakdown: {
        skillMatch: 39,
        experienceMatch: 24,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  {
    job: {
      id: 'demo-job-4',
      title: '后端架构师 (Go / 高并发)',
      company: '某知名 FinTech 跨国公司',
      city: '上海',
      workMode: 'ONSITE',
      salaryText: '35K-48K·16薪',
      salaryMin: 35000,
      salaryMax: 48000,
      description: '负责核心结算交易链路的重构与性能压测，要求熟练掌握高可用架构设计与分布式一致性。',
      url: 'https://example.com/demo-job-4',
      platform: 'LIEPIN',
      publishOrActiveTime: '3天前活跃',
      discoveredAt: new Date(Date.now() - 3600000 * 48).toISOString()
    },
    status: 'APPLIED',
    statusHistory: [
      { status: 'DISCOVERED', timestamp: '2026-09-12T11:00:00Z' },
      { status: 'APPROVED', timestamp: '2026-09-13T09:00:00Z' },
      { status: 'APPLIED', timestamp: '2026-09-13T09:15:00Z', note: '官网 ATS 渠道投递完成' }
    ],
    filterResult: {
      passed: true,
      score: 86,
      matchedScenario: 'onsite',
      reasons: ['【业务稳定性强】金融核心链路', '【年终奖丰厚】16薪体系'],
      breakdown: {
        skillMatch: 36,
        experienceMatch: 22,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 3600000 * 18).toISOString()
  },
  {
    job: {
      id: 'demo-job-5',
      title: '全栈开发工程师 (急聘/驻场)',
      company: '某外包技术服务商 (风险拦截示例)',
      city: '本地驻场',
      workMode: 'ONSITE',
      salaryText: '18K-22K',
      salaryMin: 18000,
      salaryMax: 22000,
      description: '为某银行驻场开发，要求能接受随时加班与封闭式开发，单休，技术栈老旧 JSP/Struts2。',
      url: 'https://example.com/demo-job-5',
      platform: 'OTHER',
      publishOrActiveTime: '刚刚',
      discoveredAt: new Date(Date.now() - 3600000 * 1).toISOString()
    },
    status: 'FILTERED_OUT',
    statusHistory: [
      { status: 'DISCOVERED', timestamp: '2026-09-15T09:00:00Z' },
      { status: 'FILTERED_OUT', timestamp: '2026-09-15T09:00:05Z', note: '命中反向严格规则：单休+外包驻场+技术老旧' }
    ],
    filterResult: {
      passed: false,
      score: 28,
      reasons: [
        '【硬规则淘汰】命中严格规则：非双休（单休/大小周排斥）',
        '【黑名单关键词】命中外包/驻场风险词汇',
        '【薪资与技术栈不符】远低于期望底线'
      ],
      breakdown: {
        skillMatch: 10,
        experienceMatch: 10,
        scheduleAndBenefits: 0,
        growthAndDomain: 8
      }
    },
    lastUpdated: new Date(Date.now() - 3600000 * 1).toISOString()
  }
];

export function getDemoAiAnalysis(jobTitle: string, company: string) {
  return {
    score: 92,
    reasons: [
      `【Demo 演示分析】${jobTitle} 与候选人主档案的技术栈（TypeScript/Node.js/Agent架构）契合度极高（约95%）；`,
      `【公司环境】${company} 的业务形态符合精益研发与工程化沉淀；`,
      `【薪资发展】匹配预期，建议优先推进。`
    ],
    risks: ['【提示】当前处于公开 Demo 模式，本诊断为演示沙箱结果，未调用真实云端 LLM。'],
    highlightAdvice: '建议在简历前言突出全栈架构与 Agent 自动化工具链的落地量化战绩。'
  };
}

export function getDemoTailoredResume(jobTitle: string, company: string): TailoredResume {
  return {
    jobId: 'demo-auto-tailored',
    company,
    jobTitle,
    generatedAt: new Date().toISOString(),
    greetingMessage: `您好！看到贵司正在招聘【${jobTitle}】。我有8年全栈系统与 AI Agent 落地实战背景，熟练掌握 TypeScript/Node.js/微服务，与岗位方向高度吻合。附件是根据贵司 JD 定制的技术履历，期待沟通！`,
    keyMatchingPoints: [
      '8年技术架构与分布式高并发研发经验',
      '深入的 LLM Agent 与企业级工作流工程化实战',
      '主导过日活千万级系统核心研发，交付质量过硬'
    ],
    markdownContent: `# 李明 - 【${jobTitle}】量身定制简历 (Demo)\n\n> 本简历为 Job-Hunter OS 演示沙箱自动生成，已保护真实用户信息并阻断外部 LLM 计费。\n\n## 核心竞争力\n- 深度契合 ${company} 的技术与业务诉求\n- 具备从 0 到 1 打造高可用系统与 AI 提效工具的闭环能力\n`
  };
}
