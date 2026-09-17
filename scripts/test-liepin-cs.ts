import { MacChromeController } from '../src/modules/browser/MacChromeController.js';
import { JobHunterCore } from '../src/core.js';
import { JobPost } from '../src/types/index.js';

async function main() {
  const ctrl = new MacChromeController();
  console.log('⚡ 正在读取当前猎聘页面的全部在招岗位...');

  const jsCode = `
(function() {
  var cards = document.querySelectorAll('.job-list-item, .job-card-pc-container');
  var list = [];
  cards.forEach(function(c) {
    try {
      var isAd = c.innerText.indexOf('广告') !== -1;
      if (isAd) return;

      var text = c.innerText;
      var a = c.querySelector('a');
      var href = a ? a.href : '';

      // 提取标题
      var titleEl = c.querySelector('.job-title-box, .ellipsis-1');
      var title = titleEl ? titleEl.innerText.trim() : '';

      // 提取地点（如 【长沙-岳麓区】）
      var dqMatch = text.match(/【(.*?)】/);
      var city = dqMatch ? dqMatch[1].trim() : '';

      // 提取薪资（如 20-35k）
      var salaryMatch = text.match(/(\\d+[-~至]\\d+[kK](?:·\\d+薪)?)/);
      var salaryText = salaryMatch ? salaryMatch[1] : '';

      // 提取公司
      var compEl = c.querySelector('.company-name, [class*=company]');
      var company = compEl ? compEl.innerText.trim() : '';

      // 提取时效
      var activeMatch = text.match(/(刚刚|\\d+小时前在线|\\d+分钟前在线|当前在线|\\d+天前|本月)/);
      var activeTime = activeMatch ? activeMatch[1] : '近期活跃';

      if (title && href) {
        list.push({
          id: 'liepin_' + btoa(unescape(encodeURIComponent(href))).substring(0, 16),
          title: title,
          company: company || '猎头精选企业',
          city: city || '长沙',
          workMode: (city.indexOf('远程') !== -1) ? 'REMOTE' : 'ONSITE',
          salaryText: salaryText || '面议',
          description: text.substring(0, 200),
          url: href,
          platform: 'LIEPIN',
          publishOrActiveTime: activeTime,
          discoveredAt: new Date().toISOString()
        });
      }
    } catch(e) {}
  });
  return JSON.stringify(list);
})()
`;

  const raw = await ctrl.executeJsInActiveTab(jsCode);
  const rawJobs: JobPost[] = JSON.parse(raw);
  console.log(`📌 从页面中共抓取到 ${rawJobs.length} 个候选岗位`);

  // 严格过滤：仅限长沙本地或远程
  const changshaJobs = rawJobs.filter(j => j.city.includes('长沙') || j.workMode === 'REMOTE');
  console.log(`🎯 其中属于【长沙本地】或【远程】的真实岗位: ${changshaJobs.length} 个`);

  const agent = new JobHunterCore();
  for (const job of changshaJobs) {
    console.log(`\n🔎 正在严格评估: [${job.company}] ${job.title} (${job.salaryText}) 地点: ${job.city}`);
    const res = await agent.processSingleJob(job);
    if (res.approved) {
      console.log(`🎉 审核通过并已成功推送到你的飞书！`);
    } else {
      console.log(`🛑 未通过理由: ${res.reason}`);
    }
  }
}

main().catch(console.error);
