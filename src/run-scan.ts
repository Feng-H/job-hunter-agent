import { JobHunterCore } from './core.js';

async function main() {
  console.log('⚡ 正在以【小批量精选模式】启动真实招聘扫描...');
  const agent = new JobHunterCore();
  await agent.runDiscoveryCycle();
  console.log('✅ 扫描与飞书审批卡片推送完成！');
}

main().catch(err => {
  console.error('执行失败:', err);
});
