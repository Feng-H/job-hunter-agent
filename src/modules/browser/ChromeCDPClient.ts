import { chromium, Browser, BrowserContext, Page } from 'playwright-core';

export interface ChromeCDPOptions {
  cdpUrl?: string; // 默认 http://127.0.0.1:9222
  chromePath?: string;
}

export class ChromeCDPClient {
  private cdpUrl: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(options?: ChromeCDPOptions) {
    this.cdpUrl = options?.cdpUrl || process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
  }

  /**
   * 尝试连接已启动的 Chrome 实例
   */
  public async connect(): Promise<boolean> {
    try {
      console.log(`🔌 [CDP] 正在连接本地 Chrome 调试端口: ${this.cdpUrl} ...`);
      this.browser = await chromium.connectOverCDP(this.cdpUrl);
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
      }
      console.log(`✅ [CDP] 成功接管本地 Chrome 浏览器！`);
      return true;
    } catch (e: any) {
      console.warn(`⚠️ [CDP] 未能连接到本地 Chrome (${this.cdpUrl})。请确保 Chrome 已启动并开启了远程调试端口。`);
      return false;
    }
  }

  /**
   * 新建一个专用的后台工作页面，抓取完后可安全关闭
   */
  public async createNewPage(): Promise<Page | null> {
    if (!this.browser) {
      const ok = await this.connect();
      if (!ok) return null;
    }
    if (this.context) {
      return await this.context.newPage();
    }
    return null;
  }

  /**
   * 获取已有工作页面
   */
  public async getPage(): Promise<Page | null> {
    if (!this.browser) {
      const ok = await this.connect();
      if (!ok) return null;
    }
    if (this.context) {
      const pages = this.context.pages();
      return pages.length > 0 ? pages[0] : await this.context.newPage();
    }
    return null;
  }

  public async close(): Promise<void> {
    // 接管模式下只断开连接，绝对不要杀死用户的 Chrome 进程！
    if (this.browser) {
      this.browser = null;
      this.context = null;
    }
  }
}
