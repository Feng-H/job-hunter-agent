import type { Page } from 'playwright-core'; // 仅类型引用，打包时被擦除，不进入云函数依赖链
import { JobPost } from '../../types/index.js';
import { ChromeCDPClient } from '../browser/ChromeCDPClient.js';

export interface SearchQuery {
  platform: 'BOSS' | 'LIEPIN' | 'ZHAOPIN';
  keyword: string;
  cityCode?: string; // 城市代码
  cityName: string;
}

export class ChromePlatformScraper {
  private cdpClient: ChromeCDPClient;

  constructor(cdpClient?: ChromeCDPClient) {
    this.cdpClient = cdpClient || new ChromeCDPClient();
  }

  /**
   * 自动在接管的 Chrome 中检索 Boss直聘
   */
  public async scrapeBoss(keyword: string, city: string = '长沙'): Promise<JobPost[]> {
    const page = await this.cdpClient.createNewPage();
    if (!page) {
      console.warn('⚠️ [BossScraper] 无法创建页面');
      return [];
    }

    const jobs: JobPost[] = [];
    try {
      console.log(`🔍 [Boss直聘] 正在检索: [城市: ${city}, 关键词: ${keyword}]...`);
      const cityParam = city === '长沙' ? 'city=101250100' : 'city=100010000';
      const searchUrl = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(keyword)}&${cityParam}`;

      await page.goto(searchUrl, { waitUntil: 'load', timeout: 35000 });
      await page.waitForTimeout(4000); // 等待异步卡片加载

      const jobCards = await page.$$('.job-card-wrapper');
      console.log(`📌 [Boss直聘] 抓取到 ${jobCards.length} 个岗位卡片`);

      for (const card of jobCards.slice(0, 5)) {
        try {
          const title = (await card.$eval('.job-name', el => el.textContent || '')).trim();
          const company = (await card.$eval('.company-name', el => el.textContent || '')).trim();
          const salary = (await card.$eval('.salary', el => el.textContent || '')).trim();
          const location = (await card.$eval('.job-area', el => el.textContent || '')).trim();
          const href = await card.$eval('.job-card-left', el => (el as HTMLAnchorElement).getAttribute('href') || '');
          const tags = await card.$$eval('.tag-list li', list => list.map(li => li.textContent?.trim() || ''));
          let activeTime = '';
          try {
            activeTime = (await card.$eval('.boss-online-tag, .boss-info, .info-public', el => el.textContent || '')).trim();
          } catch {}

          const fullUrl = href.startsWith('http') ? href : `https://www.zhipin.com${href}`;

          jobs.push({
            id: `boss_${Buffer.from(fullUrl).toString('base64').substring(0, 16)}`,
            title,
            company,
            city: location || city,
            workMode: (location.includes('远程') || keyword.includes('远程')) ? 'REMOTE' : 'ONSITE',
            salaryText: salary,
            description: `岗位标签: ${tags.join(' ｜ ')}。职位关键词：${keyword}`,
            url: fullUrl,
            platform: 'BOSS',
            publishOrActiveTime: activeTime || '近期活跃',
            discoveredAt: new Date().toISOString()
          });
        } catch (cardErr) {}
      }
    } catch (e: any) {
      console.error('❌ [BossScraper] 抓取异常:', e.message);
    } finally {
      await page.close().catch(() => {});
    }
    return jobs;
  }

  /**
   * 自动在接管的 Chrome 中检索 猎聘网
   */
  public async scrapeLiepin(keyword: string, city: string = '长沙'): Promise<JobPost[]> {
    const page = await this.cdpClient.createNewPage();
    if (!page) return [];

    const jobs: JobPost[] = [];
    try {
      console.log(`🔍 [猎聘网] 正在检索: [城市: ${city}, 关键词: ${keyword}]...`);
      const searchUrl = `https://www.liepin.com/zhaopin/?city=190020&dq=190020&key=${encodeURIComponent(keyword)}`;

      await page.goto(searchUrl, { waitUntil: 'load', timeout: 35000 });
      await page.waitForTimeout(4000);

      const jobCards = await page.$$('.job-list-item, .job-card-pc-container');
      console.log(`📌 [猎聘网] 抓取到 ${jobCards.length} 个岗位卡片`);

      for (const card of jobCards.slice(0, 5)) {
        try {
          const title = (await card.$eval('.job-title-box, .ellipsis-1', el => el.textContent || '')).trim();
          const company = (await card.$eval('.company-name', el => el.textContent || '')).trim();
          const salary = (await card.$eval('.job-salary', el => el.textContent || '')).trim();
          const location = (await card.$eval('.job-dq-box', el => el.textContent || '')).trim();
          const href = await card.$eval('a', el => (el as HTMLAnchorElement).getAttribute('href') || '');

          const fullUrl = href.startsWith('http') ? href : `https://www.liepin.com${href}`;

          jobs.push({
            id: `liepin_${Buffer.from(fullUrl).toString('base64').substring(0, 16)}`,
            title,
            company,
            city: location || city,
            workMode: (location.includes('远程') || keyword.includes('远程')) ? 'REMOTE' : 'ONSITE',
            salaryText: salary,
            description: `猎聘在招职位。关键词：${keyword}`,
            url: fullUrl,
            platform: 'LIEPIN',
            publishOrActiveTime: '近期更新',
            discoveredAt: new Date().toISOString()
          });
        } catch (cardErr) {}
      }
    } catch (e: any) {
      console.error('❌ [LiepinScraper] 抓取异常:', e.message);
    } finally {
      await page.close().catch(() => {});
    }
    return jobs;
  }

  /**
   * 自动在接管的 Chrome 中检索 智联招聘
   */
  public async scrapeZhaopin(keyword: string, city: string = '长沙'): Promise<JobPost[]> {
    const page = await this.cdpClient.getPage();
    if (!page) return [];

    const jobs: JobPost[] = [];
    try {
      console.log(`🔍 [智联招聘] 正在接管浏览器检索: [城市: ${city}, 关键词: ${keyword}]...`);
      // 长沙代码 749
      const searchUrl = `https://sou.zhaopin.com/?jl=749&kw=${encodeURIComponent(keyword)}`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const jobCards = await page.$$('.joblist-box__item, .positionlist__list');
      console.log(`📌 [智联招聘] 页面抓取到 ${jobCards.length} 个岗位卡片`);

      for (const card of jobCards.slice(0, 10)) {
        try {
          const title = (await card.$eval('.iteminfo__top__job__title', el => el.textContent || '')).trim();
          const company = (await card.$eval('.iteminfo__top__company__title', el => el.textContent || '')).trim();
          const salary = (await card.$eval('.iteminfo__top__job__salary', el => el.textContent || '')).trim();
          const location = (await card.$eval('.iteminfo__top__job__area', el => el.textContent || '')).trim();
          const href = await card.$eval('a', el => (el as HTMLAnchorElement).getAttribute('href') || '');

          jobs.push({
            id: `zhaopin_${Buffer.from(href).toString('base64').substring(0, 16)}`,
            title,
            company,
            city: location || city,
            workMode: 'ONSITE',
            salaryText: salary,
            description: `智联在招职位。关键词：${keyword}`,
            url: href,
            platform: 'ZHAOPIN',
            discoveredAt: new Date().toISOString()
          });
        } catch (cardErr) {
          // 忽略单个解析
        }
      }
    } catch (e: any) {
      console.error('❌ [ZhaopinScraper] 抓取异常:', e.message);
    }
    return jobs;
  }
}
