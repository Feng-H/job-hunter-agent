import { MacChromeController } from '../src/modules/browser/MacChromeController.js';
import { JobHunterCore } from '../src/core.js';

async function scanViaMac() {
  const ctrl = new MacChromeController();
  const info = await ctrl.getActiveTabInfo();
  console.log(`\n🖥️ [macOS原生通道] 当前前台标签页:「${info.title}」(${info.url})`);

  console.log('⚡ 正在直接通过 macOS 系统事件提取页面控件中的真实岗位...');
  const jobs = await ctrl.extractJobsFromCurrentPage();
  console.log(`📌 共抓取到 ${jobs.length} 个结构化在招岗位！`);

  if (jobs.length === 0) {
    console.log('💡 提示：当前前台页面不是招聘列表页（如 Boss/猎聘/智联）。');
    console.log('👉 请在 Chrome 中切到 Boss直聘、猎聘或智联的搜索结果页，再次运行本命令即可瞬间完成筛选与推送！');
    return;
  }

  const agent = new JobHunterCore();
  let pushedCount = 0;
  for (const job of jobs) {
    const res = await agent.processSingleJob(job);
    if (res.approved) pushedCount++;
  }

  console.log(`\n🎉 本次筛选完成！共向飞书推送了 ${pushedCount} 个高匹配度真实验证职位！`);
}

scanViaMac().catch(console.error);
