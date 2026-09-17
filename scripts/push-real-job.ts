import { JobHunterCore } from '../src/core.js';
import { JobPost } from '../src/types/index.js';

async function main() {
  const agent = new JobHunterCore();

  const realJob: JobPost = {
    id: 'liepin_79556735',
    title: '数字化部长（世界500强企业+发展平台好）',
    company: '某知名世界500强集团（长沙）',
    city: '长沙',
    workMode: 'ONSITE',
    salaryText: '30-55K',
    salaryMin: 30000,
    salaryMax: 55000,
    description: '岗位职责：1. 全面负责集团制造基地数字化战略规划与顶层架构设计；2. 主导推进智能制造、设备全生命周期管理系统（EAM）、MES 与 SAP 业务数据深度闭环；3. 统筹大型制造业数字化团队与数据治理体系建设。任职要求：10年以上大型制造集团数字化管理经验，具备世界500强或行业龙头企业全生命周期变革领导力。周末双休，福利健全。',
    url: 'https://www.liepin.com/a/79556735.shtml',
    platform: 'LIEPIN',
    publishOrActiveTime: '49分钟前在线',
    discoveredAt: new Date().toISOString()
  };

  console.log(`🚀 正在对猎聘最新真实在招岗位进行全流程评估与推送: [${realJob.company}] ${realJob.title} (${realJob.salaryText})...`);
  const res = await agent.processSingleJob(realJob);
  console.log('推送状态:', res);
}

main().catch(console.error);
