import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { JobPost } from '../../types/index.js';

const execAsync = promisify(exec);

export class MacChromeController {
  /**
   * 执行 AppleScript 脚本
   */
  public async runAppleScript(script: string): Promise<string> {
    const escaped = script.replace(/"/g, '\\"');
    const cmd = `osascript -e "${escaped}"`;
    try {
      const { stdout } = await execAsync(cmd);
      return stdout.trim();
    } catch (e: any) {
      throw new Error(`AppleScript 执行失败: ${e.message}`);
    }
  }

  /**
   * 在当前 Chrome 激活的标签页中执行 JavaScript 并返回字符串结果
   */
  public async executeJsInActiveTab(jsCode: string): Promise<string> {
    const singleLine = jsCode.replace(/\n/g, ' ').replace(/"/g, '\\"');
    const script = `tell application "Google Chrome" to execute active tab of front window javascript "${singleLine}"`;
    return await this.runAppleScript(script);
  }

  /**
   * 获取当前激活标签页的标题与 URL
   */
  public async getActiveTabInfo(): Promise<{ title: string; url: string }> {
    const script = `tell application "Google Chrome" to get {title, URL} of active tab of front window`;
    const res = await this.runAppleScript(script);
    const parts = res.split(', ');
    return {
      title: parts.slice(0, -1).join(', '),
      url: parts[parts.length - 1] || ''
    };
  }

  /**
   * 获取前台 Chrome 窗口的所有标签页标题和 URL
   */
  public async getAllTabs(): Promise<Array<{ index: number; title: string; url: string }>> {
    const script = `
tell application "Google Chrome"
  set tabList to {}
  set i to 1
  repeat with t in tabs of front window
    set end of tabList to (i as string) & "|||" & (title of t) & "|||" & (URL of t)
    set i to i + 1
  end repeat
  set AppleScript's text item delimiters to "###"
  return tabList as string
end tell`;
    const raw = await this.runAppleScript(script);
    if (!raw) return [];
    const items = raw.split('###');
    return items.map(item => {
      const [idx, title, url] = item.split('|||');
      return { index: parseInt(idx, 10), title: title || '', url: url || '' };
    });
  }

  /**
   * 激活指定索引的标签页
   */
  public async activateTab(tabIndex: number): Promise<void> {
    const script = `tell application "Google Chrome" to set active tab index of front window to ${tabIndex}`;
    await this.runAppleScript(script);
  }

  /**
   * 在当前页面直接通过原生 DOM 提取结构化岗位列表
   * （支持 Boss直聘、猎聘、智联）
   */
  public async extractJobsFromCurrentPage(): Promise<JobPost[]> {
    const jsExtractor = `
(function() {
  var host = window.location.hostname;
  var jobs = [];

  if (host.indexOf('zhipin.com') !== -1) {
    var cards = document.querySelectorAll('.job-card-wrapper');
    cards.forEach(function(card) {
      try {
        var titleEl = card.querySelector('.job-name');
        var compEl = card.querySelector('.company-name');
        var salaryEl = card.querySelector('.salary');
        var areaEl = card.querySelector('.job-area');
        var linkEl = card.querySelector('.job-card-left');
        var tags = Array.from(card.querySelectorAll('.tag-list li')).map(function(li){ return li.innerText.trim(); });
        var activeEl = card.querySelector('.boss-online-tag, .boss-info, .info-public');

        if (titleEl && compEl && linkEl) {
          var href = linkEl.getAttribute('href');
          var fullUrl = href.indexOf('http') === 0 ? href : 'https://www.zhipin.com' + href;
          jobs.push({
            id: 'boss_' + btoa(unescape(encodeURIComponent(fullUrl))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: (areaEl && areaEl.innerText.indexOf('远程') !== -1) ? 'REMOTE' : 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: '岗位标签: ' + tags.join(' ｜ '),
            url: fullUrl,
            platform: 'BOSS',
            publishOrActiveTime: activeEl ? activeEl.innerText.trim() : '近期活跃',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch(e) {}
    });
  } else if (host.indexOf('liepin.com') !== -1) {
    var cards = document.querySelectorAll('.job-list-item, .job-card-pc-container');
    cards.forEach(function(card) {
      try {
        var titleEl = card.querySelector('.job-title-box, .ellipsis-1');
        var compEl = card.querySelector('.company-name');
        var salaryEl = card.querySelector('.job-salary');
        var areaEl = card.querySelector('.job-dq-box');
        var linkEl = card.querySelector('a');
        var timeEl = card.querySelector('.time, .subscribe');

        if (titleEl && compEl && linkEl) {
          var href = linkEl.getAttribute('href');
          var fullUrl = href.indexOf('http') === 0 ? href : 'https://www.liepin.com' + href;
          jobs.push({
            id: 'liepin_' + btoa(unescape(encodeURIComponent(fullUrl))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: '猎聘在招职位：' + titleEl.innerText.trim(),
            url: fullUrl,
            platform: 'LIEPIN',
            publishOrActiveTime: timeEl ? timeEl.innerText.trim() : '近期更新',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch(e) {}
    });
  } else if (host.indexOf('zhaopin.com') !== -1) {
    var cards = document.querySelectorAll('.joblist-box__item, .positionlist__list');
    cards.forEach(function(card) {
      try {
        var titleEl = card.querySelector('.iteminfo__top__job__title');
        var compEl = card.querySelector('.iteminfo__top__company__title');
        var salaryEl = card.querySelector('.iteminfo__top__job__salary');
        var areaEl = card.querySelector('.iteminfo__top__job__area');
        var linkEl = card.querySelector('a');

        if (titleEl && compEl && linkEl) {
          var href = linkEl.getAttribute('href');
          jobs.push({
            id: 'zhaopin_' + btoa(unescape(encodeURIComponent(href))).substring(0, 16),
            title: titleEl.innerText.trim(),
            company: compEl.innerText.trim(),
            city: areaEl ? areaEl.innerText.trim() : '长沙',
            workMode: 'ONSITE',
            salaryText: salaryEl ? salaryEl.innerText.trim() : '面议',
            description: '智联在招职位：' + titleEl.innerText.trim(),
            url: href,
            platform: 'ZHAOPIN',
            publishOrActiveTime: '近期发布',
            discoveredAt: new Date().toISOString()
          });
        }
      } catch(e) {}
    });
  }

  return JSON.stringify(jobs);
})();
`;
    const jsonStr = await this.executeJsInActiveTab(jsExtractor);
    try {
      return JSON.parse(jsonStr) || [];
    } catch {
      return [];
    }
  }
}
