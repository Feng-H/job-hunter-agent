const Chrome = Application("Google Chrome");

function run() {
  if (Chrome.windows.length === 0) return JSON.stringify({ error: "NO_CHROME_WINDOW" });

  const tab = Chrome.windows[0].activeTab();
  const url = tab.url();
  const title = tab.title();

  // 纯只读提取代码（绝不修改任何 window.location，绝不触发跳转）
  const readOnlyExtractor = `
(function() {
  var fullText = document.body ? document.body.innerText : '';

  // 1. 安全探针：检测是否有风控或验证码特征
  var riskKeywords = ['403.html', '_security_check', 'security_verify', '访问过于频繁', '请输入验证码', '网络异常'];
  for (var i = 0; i < riskKeywords.length; i++) {
    if (window.location.href.indexOf(riskKeywords[i]) !== -1 || fullText.indexOf(riskKeywords[i]) !== -1) {
      return JSON.stringify({ riskDetected: true, reason: riskKeywords[i] });
    }
  }

  // 2. 正常结构化只读提取
  var cards = document.querySelectorAll('.job-list-item, .job-card-pc-container, .job-card-wrapper, .joblist-box__item');
  var list = [];

  cards.forEach(function(c) {
    try {
      if (c.innerText.indexOf('广告') !== -1) return;
      var text = c.innerText;
      var a = c.querySelector('a');
      var href = a ? a.href : '';

      var titleEl = c.querySelector('.job-title-box, .ellipsis-1, .job-name, .iteminfo__top__job__title');
      var title = titleEl ? titleEl.innerText.trim() : '';

      var dqMatch = text.match(/【(.*?)】/) || text.match(/([\\u4e00-\\u9fa5]{2,6}(?:-[\\u4e00-\\u9fa5]{2,6})?)/);
      var city = dqMatch ? dqMatch[1].trim() : '长沙';

      var salaryMatch = text.match(/(\\d+[-~至]\\d+[kK](?:·\\d+薪)?)/);
      var salaryText = salaryMatch ? salaryMatch[1] : '';

      var compEl = c.querySelector('.company-name, [class*=company], .iteminfo__top__company__title');
      var company = compEl ? compEl.innerText.trim() : '';

      var activeMatch = text.match(/(刚刚|\\d+小时前在线|\\d+分钟前在线|当前在线|\\d+天前|本月)/);
      var activeTime = activeMatch ? activeMatch[1] : '近期活跃';

      if (title && href) {
        list.push({
          title: title,
          company: company || '知名企业/猎头直聘',
          city: city,
          salaryText: salaryText || '面议',
          activeTime: activeTime,
          url: href,
          rawText: text.substring(0, 150)
        });
      }
    } catch(e) {}
  });

  return JSON.stringify({ riskDetected: false, jobs: list });
})()
`;

  try {
    const res = tab.execute({ javascript: readOnlyExtractor });
    return res;
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

run();
