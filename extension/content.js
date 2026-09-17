(function () {
  const host = window.location.hostname;

  // ================= 工具函数 =================
  function canonicalKey(url) {
    // 客户端去重键：与服务器指纹同源的 URL 归一化（剔除 query/fragment）
    try {
      const u = new URL(url, location.origin);
      return u.host.toLowerCase() + u.pathname.replace(/\/+$/, '');
    } catch (e) {
      return (url || '').split(/[?#]/)[0];
    }
  }

  function makeId(prefix, url) {
    return prefix + '_' + btoa(unescape(encodeURIComponent(url))).substring(0, 16);
  }

  function detectPageType() {
    const path = location.pathname;
    if (host.includes('zhipin.com') && /job_detail/.test(path)) return 'boss_detail';
    if (host.includes('liepin.com') && (/\/job\//.test(path) || document.querySelector('.job-interview-container, [class*="job-detail"]'))) {
      if (document.querySelectorAll('.job-list-item, .job-card-pc-container').length >= 3) return 'list';
      return 'liepin_detail';
    }
    return 'list';
  }

  // ================= 提取器：列表页（批量快速初筛） =================
  function extractJobsFromListPage() {
    const jobs = [];
    const pageType = detectPageType();
    if (pageType === 'boss_detail' || pageType === 'liepin_detail') {
      const single = extractJobFromDetailPage(pageType);
      return single ? [single] : [];
    }

    // ---- Boss 直聘列表 ----
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
          const compMetaEl = card.querySelector('.company-info, .company-text, .job-card-company-info');

          if (titleEl && compEl && linkEl) {
            const href = linkEl.getAttribute('href') || '';
            const fullUrl = href.startsWith('http') ? href : `https://www.zhipin.com${href}`;
            jobs.push({
              id: makeId('boss', fullUrl),
              _key: canonicalKey(fullUrl),
              title: titleEl.innerText.trim(),
              company: compEl.innerText.trim(),
              companyMeta: compMetaEl ? compMetaEl.innerText.trim() : '',
              city: areaEl ? areaEl.innerText.trim() : '未知',
              workMode: (areaEl && areaEl.innerText.includes('远程')) ? 'REMOTE' : 'ONSITE',
              salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
              description: `岗位标签: ${tags.join(' ｜ ')}${compMetaEl ? `\n公司概况: ${compMetaEl.innerText.trim()}` : ''}`,
              url: fullUrl,
              platform: 'BOSS',
              sourceType: 'COMPANY_DIRECT',
              publishOrActiveTime: activeEl ? activeEl.innerText.trim() : '近期活跃',
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (e) {}
      });
    }

    // ---- 猎聘列表（含猎头帖识别） ----
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
          const cardText = card.innerText || '';

          const isHeadhunter = /猎头|人才咨询|人力资源服务|猎企/.test(cardText) ||
                               /某(知名|大型|头部|上市)?(互联|科技|制造|新能源|医药)?(网)??(公司|企业|集团)/.test(compEl ? compEl.innerText : '');

          if (titleEl && compEl && linkEl) {
            const href = linkEl.getAttribute('href') || '';
            const fullUrl = href.startsWith('http') ? href : `https://www.liepin.com${href}`;
            jobs.push({
              id: makeId('liepin', fullUrl),
              _key: canonicalKey(fullUrl),
              title: titleEl.innerText.trim(),
              company: compEl.innerText.trim(),
              city: areaEl ? areaEl.innerText.trim() : '未知',
              workMode: 'ONSITE',
              salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
              description: `猎聘职位：${titleEl.innerText.trim()}`,
              url: fullUrl,
              platform: 'LIEPIN',
              sourceType: isHeadhunter ? 'HEADHUNTER' : 'COMPANY_DIRECT',
              publishOrActiveTime: timeEl ? timeEl.innerText.trim() : '近期更新',
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (e) {}
      });
    }

    // ---- 智联列表 ----
    else if (host.includes('zhaopin.com')) {
      const cards = document.querySelectorAll('.joblist-box__item, .positionlist__list');
      cards.forEach(card => {
        try {
          const titleEl = card.querySelector('.iteminfo__top__job__title');
          const compEl = card.querySelector('.iteminfo__top__company__title');
          const salaryEl = card.querySelector('.iteminfo__top__job__salary');
          const areaEl = card.querySelector('.iteminfo__top__job__area');
          const linkEl = card.querySelector('a');
          const cardText = card.innerText || '';
          const isHeadhunter = /猎头|人力资源|人才咨询/.test(cardText);

          if (titleEl && compEl && linkEl) {
            const href = linkEl.getAttribute('href') || '';
            jobs.push({
              id: makeId('zhaopin', href),
              _key: canonicalKey(href),
              title: titleEl.innerText.trim(),
              company: compEl.innerText.trim(),
              city: areaEl ? areaEl.innerText.trim() : '未知',
              workMode: 'ONSITE',
              salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
              description: `智联在招职位：${titleEl.innerText.trim()}`,
              url: href,
              platform: 'ZHAOPIN',
              sourceType: isHeadhunter ? 'HEADHUNTER' : 'COMPANY_DIRECT',
              publishOrActiveTime: '近期发布',
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (e) {}
      });
    }

    return jobs;
  }

  // ================= 提取器：详情页（单岗位全量 JD） =================
  function extractJobFromDetailPage(pageType) {
    try {
      if (pageType === 'boss_detail') {
        const titleEl = document.querySelector('.job-primary .name, .info-primary .name, .job-banner .name');
        const salaryEl = document.querySelector('.job-primary .salary, .info-primary .salary');
        const compEl = document.querySelector('.company-info .name, .job-sider .company, .company-text .name');
        const jdEl = document.querySelector('.job-sec-text, .job-detail-section, .detail-content, .job-detail');
        const metaEl = document.querySelector('.job-primary .job-tags, .info-primary p, .job-tags');
        const hrEl = document.querySelector('.job-sider .boss-info, .name-text, .boss-info-attr');

        const title = titleEl ? titleEl.innerText.split('\n')[0].trim() : document.title.split('-')[0].trim();
        if (!title) return null;

        return {
          id: makeId('boss', location.href),
          _key: canonicalKey(location.href),
          title,
          company: compEl ? compEl.innerText.trim() : '',
          city: metaEl ? metaEl.innerText.split('\n')[0].trim() : '未知',
          workMode: (document.body.innerText.includes('远程')) ? 'REMOTE' : 'ONSITE',
          salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
          description: jdEl ? jdEl.innerText.trim().slice(0, 4000) : document.body.innerText.slice(0, 2500),
          url: location.href,
          platform: 'BOSS',
          sourceType: 'COMPANY_DIRECT',
          detailCaptured: true,
          hrName: hrEl ? hrEl.innerText.trim().slice(0, 50) : '',
          publishOrActiveTime: '详情页采集',
          discoveredAt: new Date().toISOString()
        };
      }

      if (pageType === 'liepin_detail') {
        const titleEl = document.querySelector('.job-interview-container .job-title, .ellipsis-1, h1');
        const compEl = document.querySelector('.company-name, .job-company-info .company-name, .company-info-container .name');
        const salaryEl = document.querySelector('.job-salary, .salary');
        const jdEl = document.querySelector('.job-interview-container .job-item-description, .job-description, [class*="job-item-description"], .content');
        const bodyText = document.body.innerText || '';
        const isHeadhunter = /猎头|人才咨询|人力资源服务/.test(bodyText.slice(0, 3000));

        const title = titleEl ? titleEl.innerText.trim() : document.title.split('-')[0].trim();
        if (!title) return null;

        return {
          id: makeId('liepin', location.href),
          _key: canonicalKey(location.href),
          title,
          company: compEl ? compEl.innerText.trim() : '',
          city: '以详情页为准',
          workMode: bodyText.includes('远程') ? 'REMOTE' : 'ONSITE',
          salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
          description: jdEl ? jdEl.innerText.trim().slice(0, 4000) : bodyText.slice(0, 2500),
          url: location.href,
          platform: 'LIEPIN',
          sourceType: isHeadhunter ? 'HEADHUNTER' : 'COMPANY_DIRECT',
          detailCaptured: true,
          publishOrActiveTime: '详情页采集',
          discoveredAt: new Date().toISOString()
        };
      }
    } catch (e) {}
    return null;
  }

  // ================= 客户端去重存储 =================
  const DEDUP_STORE_KEY = 'collectedJobKeys';
  const DEDUP_MAX = 1000; // 本地最多记住 1000 条，防 storage 膨胀

  function loadCollectedKeys() {
    return new Promise(resolve => {
      chrome.storage.local.get([DEDUP_STORE_KEY], res => {
        resolve(res[DEDUP_STORE_KEY] || {});
      });
    });
  }

  function saveCollectedKeys(keys) {
    const entries = Object.entries(keys);
    if (entries.length > DEDUP_MAX) {
      // 按时间戳淘汰最旧的记录
      entries.sort((a, b) => a[1] - b[1]);
      const trimmed = Object.fromEntries(entries.slice(entries.length - DEDUP_MAX));
      chrome.storage.local.set({ [DEDUP_STORE_KEY]: trimmed });
    } else {
      chrome.storage.local.set({ [DEDUP_STORE_KEY]: keys });
    }
  }

  function markCollected(keys, jobKeyList) {
    const now = Date.now();
    jobKeyList.forEach(k => { keys[k] = now; });
    saveCollectedKeys(keys);
  }

  // ================= 轻提示 Toast（自动采集反馈，不打扰） =================
  function showToast(text, bg) {
    let el = document.getElementById('jh-auto-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'jh-auto-toast';
      el.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 999998;
        color: #fff; padding: 10px 16px; border-radius: 10px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12.5px; font-weight: 600;
        transition: opacity 0.4s, transform 0.4s; opacity: 0; transform: translateY(-8px);
      `;
      document.body.appendChild(el);
    }
    el.style.background = bg || '#059669';
    el.innerText = text;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
    }, 3000);
  }

  // ================= 同步核心 =================
  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['serverUrl', 'collectorToken', 'autoSync'], res => {
        resolve({
          serverUrl: (res.serverUrl || 'http://127.0.0.1:8765').replace(/\/+$/, ''),
          collectorToken: res.collectorToken || '',
          autoSync: res.autoSync !== false // 默认开启
        });
      });
    });
  }

  async function postJobs(jobs) {
    const settings = await getSettings();
    if (!settings.collectorToken) return { error: 'no-token' };
    // 发送前剥离内部 _key 字段
    const payload = jobs.map(({ _key, ...rest }) => rest);
    const response = await fetch(`${settings.serverUrl}/api/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.collectorToken}`
      },
      body: JSON.stringify({ jobs: payload })
    });
    return await response.json();
  }

  // ================= 悬浮胶囊（手动批量同步入口） =================
  let capsuleEl = null;

  function updateCapsule(jobs) {
    if (jobs.length === 0) {
      if (capsuleEl) capsuleEl.style.display = 'none';
      return;
    }

    const isDetail = jobs.length === 1 && jobs[0].detailCaptured;

    if (!capsuleEl) {
      capsuleEl = document.createElement('div');
      capsuleEl.id = 'jh-floating-capsule';
      capsuleEl.style.cssText = `
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
        color: #fff;
        padding: 10px 18px;
        border-radius: 9999px;
        box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4), 0 8px 10px -6px rgba(79, 70, 229, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      `;
      capsuleEl.onmouseenter = () => capsuleEl.style.transform = 'translateY(-2px) scale(1.02)';
      capsuleEl.onmouseleave = () => capsuleEl.style.transform = 'translateY(0) scale(1)';
      capsuleEl.onclick = manualSync;
      document.body.appendChild(capsuleEl);
    }

    capsuleEl.style.display = 'flex';
    if (isDetail) {
      capsuleEl.style.background = 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)';
      capsuleEl.innerHTML = `
        <span style="font-size: 16px;">🔬</span>
        <span>深度抓取【${jobs[0].title.slice(0, 12)}】全量 JD</span>
        <span style="background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 999px; font-size: 11px;">点击送入 AI 深析</span>
      `;
    } else {
      capsuleEl.style.background = 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)';
      const hhCount = jobs.filter(j => j.sourceType === 'HEADHUNTER').length;
      capsuleEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>
        <span>发现 <b>${jobs.length}</b> 个岗位${hhCount > 0 ? `（含 ${hhCount} 猎头帖）` : ''}</span>
        <span style="background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 999px; font-size: 11px;">点击一键同步</span>
      `;
    }
  }

  // 手动点击胶囊：全量同步当前页岗位（服务端指纹兜底去重）
  async function manualSync() {
    if (!capsuleEl) return;
    const jobs = extractJobsFromListPage();
    if (jobs.length === 0) return;

    capsuleEl.innerHTML = `<span style="font-size: 16px;">⏳</span><span>正在同步 ${jobs.length} 个岗位...</span>`;
    try {
      const data = await postJobs(jobs);
      if (data && data.code === 0) {
        // 标记本页岗位已采集
        const keys = await loadCollectedKeys();
        markCollected(keys, jobs.map(j => j._key));
        capsuleEl.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
        capsuleEl.innerHTML = `<span style="font-size: 16px;">🎉</span><span>已同步！<b>${data.approvedCount ?? 0}</b> 个过筛</span>`;
      } else {
        throw new Error((data && data.message) || '同步失败');
      }
    } catch (err) {
      capsuleEl.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
      capsuleEl.innerHTML = `<span>❌ ${err.message || '连接失败'}</span>`;
    }
    setTimeout(() => { if (capsuleEl) updateCapsule(extractJobsFromListPage()); }, 3500);
  }

  // ================= 自动采集（核心增量逻辑） =================
  // 页面 DOM 稳定后，自动同步「本地从未采集过」的新岗位；
  // 已采集过的（无论从列表还是详情页来过）直接跳过，彻底防重复。
  let autoSyncRunning = false;

  async function autoSyncNewJobs() {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
      const settings = await getSettings();
      if (!settings.autoSync) return; // 用户关闭了自动同步

      const allJobs = extractJobsFromListPage();
      if (allJobs.length === 0) return;

      const knownKeys = await loadCollectedKeys();
      const newJobs = allJobs.filter(j => !knownKeys[j._key]);
      if (newJobs.length === 0) return;

      const data = await postJobs(newJobs);
      if (data && data.code === 0) {
        markCollected(knownKeys, newJobs.map(j => j._key));
        const isDetail = newJobs.length === 1 && newJobs[0].detailCaptured;
        if (isDetail) {
          showToast(`🔬 已自动抓取【${newJobs[0].title.slice(0, 14)}】全量 JD 并送入 AI 深析`, '#0f766e');
        } else {
          showToast(`🎯 已自动同步 ${newJobs.length} 个新岗位（重复的已自动跳过）`, '#059669');
        }
      }
    } catch (e) {
      // 静默失败：自动采集不打扰用户，下次页面稳定后重试
    } finally {
      autoSyncRunning = false;
    }
  }

  // ================= 启动与 DOM 稳定检测 =================
  // MutationObserver 防抖：连续 2.5 秒无 DOM 变化视为「页面已稳定」，触发一次自动增量采集
  let settleTimer = null;
  const observer = new MutationObserver(() => {
    updateCapsule(extractJobsFromListPage());
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(autoSyncNewJobs, 2500);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 首次加载也调度一次（部分页面无后续 DOM 变化）
  setTimeout(autoSyncNewJobs, 3500);
  updateCapsule(extractJobsFromListPage());
})();
