import { MacChromeController } from '../src/modules/browser/MacChromeController.js';

async function main() {
  const ctrl = new MacChromeController();
  const info = await ctrl.getActiveTabInfo();
  console.log(`当前激活标签页: [${info.title}] -> ${info.url}`);

  const jobs = await ctrl.extractJobsFromCurrentPage();
  console.log(`从当前网页原生控件中直接提取到 ${jobs.length} 个职位！`);
  if (jobs.length > 0) {
    console.log('首个职位样例:', JSON.stringify(jobs[0], null, 2));
  }
}

main().catch(console.error);
