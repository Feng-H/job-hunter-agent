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

  // 3. 智联招聘提取器（详情页全量 JD 深抓 + 新版列表流 + 老版兼容）
  else if (host.includes('zhaopin.com')) {
    // 通道 0：详情页 —— 读取 __INITIAL_STATE__.jobDetail.detailedPosition 结构化全量 JD
    if (/\/jobdetail\//i.test(window.location.pathname)) {
      try {
        const dp = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.jobDetail && window.__INITIAL_STATE__.jobDetail.detailedPosition;
        if (dp && dp.name && dp.companyName) {
          let welfare = [];
          try { welfare = JSON.parse(dp.welfareTags || '[]'); } catch (e) {}
          const rawDesc = dp.description || String(dp.jobDesc || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
          const desc = [rawDesc, welfare.length ? '福利保障: ' + welfare.join(' / ') : ''].filter(Boolean).join('\n').trim();
          const url = 'https://www.zhaopin.com/jobdetail/' + (dp.number || '') + '.htm';
          const isHeadhunter = /猎头|人力资源|人才咨询|人才服务/.test(String(dp.companyName || ''));
          jobs.push({
            id: 'zhaopin_' + (dp.number || btoa(unescape(encodeURIComponent(url))).substring(0, 16)),
            title: String(dp.name).replace(/\+.*(?:五险|公积金|双休|年终|带薪|补贴|餐补|包吃|包住|住宿|体检).+$/, '').trim() || dp.name,
            company: dp.companyName,
            city: dp.workCity || dp.positionWorkCity || '未知',
            workMode: /远程/.test(desc) ? 'REMOTE' : 'ONSITE',
            salaryText: dp.salary || '面议',
            description: desc.slice(0, 5000),
            url: url,
            platform: 'ZHAOPIN',
            sourceType: isHeadhunter ? 'HEADHUNTER' : 'COMPANY_DIRECT',
            detailCaptured: true,
            publishOrActiveTime: dp.positionPublishTime || dp.publishTime || '近期发布',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch (e) {}
    }

    // 通道 1（最优）：新版 SPA 全局状态 __INITIAL_STATE__.positionList —— 结构化数据带详情URL/真实薪资/发布时间
    if (jobs.length === 0) {
    try {
      const st = window.__INITIAL_STATE__;
      const list = st && Array.isArray(st.positionList) ? st.positionList : [];
      list.forEach(item => {
        try {
          if (!item || !item.name || !item.companyName) return;
          const url = (item.positionURL || item.positionUrl || '').replace(/^http:/, 'https:')
            || `https://www.zhaopin.com/jobdetail/${item.number || ''}.htm`;
          const isHeadhunter = /猎头|人力资源|人才咨询|人才服务/.test(
            String(item.companyName || '') + String(item.industryName || '') + String(item.cardCustomJson || ''));
          const tags = [item.education, item.workingExp, item.workType].filter(Boolean).join(' / ');
          jobs.push({
            id: 'zhaopin_' + (item.number || btoa(unescape(encodeURIComponent(url))).substring(0, 16)),
            title: String(item.name).replace(/\+.*(?:五险|公积金|双休|年终|带薪|补贴|餐补|包吃|包住|住宿|体检).+$/, '').trim() || item.name,
            company: item.companyName,
            city: item.workCity || '未知',
            workMode: 'ONSITE',
            salaryText: item.salary60 || item.salaryReal || '面议',
            description: `智联在招职位：${item.name}｜${tags}｜行业:${item.industryName || '未知'}`,
            url: url,
            platform: 'ZHAOPIN',
            sourceType: isHeadhunter ? 'HEADHUNTER' : 'COMPANY_DIRECT',
            publishOrActiveTime: item.publishTime || item.firstPublishTime || '近期发布',
            discoveredAt: new Date().toISOString()
          });
        } catch (e) {}
      });
    } catch (e) {}
    } // 结束通道 1（仅当详情页未提取到时才走列表通道）

    // 通道 2：新版 DOM 卡片（.job-card BEM 结构，无详情链接时降级为标题+公司伪 URL）
    if (jobs.length === 0) {
      document.querySelectorAll('.job-card').forEach(card => {
        try {
          const titleEl = card.querySelector('.job-card__title-clamp');
          const compEl = card.querySelector('.job-card__company-name');
          const salaryEl = card.querySelector('.job-card__salary');
          const locEl = card.querySelector('.job-card__location span');
          const tags = Array.from(card.querySelectorAll('.job-card__skill-tag')).map(t => t.innerText.trim()).filter(Boolean);
          if (titleEl && compEl) {
            const title = titleEl.innerText.trim();
            const company = compEl.innerText.trim();
            const pseudoUrl = 'https://www.zhaopin.com/jobs/#zp_' + encodeURIComponent(title + '|' + company);
            jobs.push({
              id: 'zhaopin_' + btoa(unescape(encodeURIComponent(pseudoUrl))).substring(0, 16),
              title: title,
              company: company,
              city: locEl ? locEl.innerText.trim().split(/\s+/)[0] : '未知',
              workMode: 'ONSITE',
              salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
              description: `智联在招职位：${title}｜${tags.join(' / ')}`,
              url: pseudoUrl,
              platform: 'ZHAOPIN',
              publishOrActiveTime: '近期发布',
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (e) {}
      });
    }

    // 通道 3：老版搜索结果页选择器兜底
    if (jobs.length === 0) {
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
    showToast('⚠️ 未能识别到职位列表：请确认处于搜索结果页；智联推荐流需先登录才能看到职位！', '#EF4444');
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
