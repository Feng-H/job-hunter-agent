(function () {
  // 自动识别脚本来源：支持本地 (127.0.0.1:8765) 与云端部署两种场景，令牌由书签 URL 携带
  const scriptEl = document.currentScript || (function () {
    const scripts = document.querySelectorAll('script[src*="bookmarklet.js"]');
    return scripts[scripts.length - 1];
  })();
  const srcUrl = new URL(scriptEl ? scriptEl.src : 'http://127.0.0.1:8765/bookmarklet.js', location.href);
  const API_BASE = srcUrl.origin;
  const API_TOKEN = srcUrl.searchParams.get('token') || '';

  const host = window.location.hostname;
  let jobs = [];

  // 1. Boss 直聘提取器
  if (host.includes('zhipin.com')) {
    const cards = document.querySelectorAll('.job-card-wrapper');
    cards.forEach(card => {
      try {
        const titleEl = card.querySelector('.job-name');
        const compEl = card.querySelector('.company-name');
        const salaryEl = card.querySelector('.salary');
        const areaEl = card.querySelector('.job-area');
        const linkEl = card.querySelector('.job-card-left');
        const tags = Array.from(card.querySelectorAll('.tag-list li')).map(li => li.innerText.trim());
        const activeEl = card.querySelector('.boss-online-tag, .boss-info, .info-public');

        if (titleEl && compEl && linkEl) {
          const href = linkEl.getAttribute('href');
          const fullUrl = href.startsWith('http') ? href : `https://www.zhipin.com${href}`;
          jobs.push({
            id: 'boss_' + btoa(unescape(encodeURIComponent(fullUrl))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: (areaEl && areaEl.innerText.includes('远程')) ? 'REMOTE' : 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: `岗位标签: ${tags.join(' ｜ ')}`,
            url: fullUrl,
            platform: 'BOSS',
            publishOrActiveTime: activeEl ? activeEl.innerText.trim() : '近期活跃',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch (e) {}
    });
  }

  // 2. 猎聘网提取器
  else if (host.includes('liepin.com')) {
    const cards = document.querySelectorAll('.job-list-item, .job-card-pc-container');
    cards.forEach(card => {
      try {
        const titleEl = card.querySelector('.job-title-box, .ellipsis-1');
        const compEl = card.querySelector('.company-name');
        const salaryEl = card.querySelector('.job-salary');
        const areaEl = card.querySelector('.job-dq-box');
        const linkEl = card.querySelector('a');
        const timeEl = card.querySelector('.time, .subscribe');

        if (titleEl && compEl && linkEl) {
          const href = linkEl.getAttribute('href');
          const fullUrl = href.startsWith('http') ? href : `https://www.liepin.com${href}`;
          jobs.push({
            id: 'liepin_' + btoa(unescape(encodeURIComponent(fullUrl))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: `猎聘在招职位：${titleEl.innerText.trim()}`,
            url: fullUrl,
            platform: 'LIEPIN',
            publishOrActiveTime: timeEl ? timeEl.innerText.trim() : '近期更新',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch (e) {}
    });
  }

  // 3. 智联招聘提取器
  else if (host.includes('zhaopin.com')) {
    const cards = document.querySelectorAll('.joblist-box__item, .positionlist__list');
    cards.forEach(card => {
      try {
        const titleEl = card.querySelector('.iteminfo__top__job__title');
        const compEl = card.querySelector('.iteminfo__top__company__title');
        const salaryEl = card.querySelector('.iteminfo__top__job__salary');
        const areaEl = card.querySelector('.iteminfo__top__job__area');
        const linkEl = card.querySelector('a');

        if (titleEl && compEl && linkEl) {
          const href = linkEl.getAttribute('href');
          jobs.push({
            id: 'zhaopin_' + btoa(unescape(encodeURIComponent(href))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: `智联在招职位：${titleEl.innerText.trim()}`,
            url: href,
            platform: 'ZHAOPIN',
            publishOrActiveTime: '近期发布',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch (e) {}
    });
  }

  // 浮窗提示
  const showToast = (msg, bg = '#10B981') => {
    let el = document.getElementById('job-hunter-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'job-hunter-toast';
      el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;font-weight:bold;transition:all 0.3s;';
      document.body.appendChild(el);
    }
    el.style.background = bg;
    el.innerText = msg;
    setTimeout(() => { if (el) el.remove(); }, 5000);
  };

  if (jobs.length === 0) {
    showToast('⚠️ 未能在此页面识别到有效职位列表，请确保处于职位搜索结果页！', '#EF4444');
    return;
  }

  showToast(`🚀 已提取 ${jobs.length} 个岗位，正在发送给 Agent 严格初筛...`, '#3B82F6');

  fetch(API_BASE + '/api/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_TOKEN
    },
    body: JSON.stringify({ jobs })
  })
  .then(res => res.json())
  .then(data => {
    showToast(data.message ? `🎉 ${data.message}` : '🎉 提交成功！', '#10B981');
  })
  .catch(err => {
    showToast('❌ 提交失败：请确认服务已启动且书签合有有效令牌！', '#EF4444');
  });
})();
