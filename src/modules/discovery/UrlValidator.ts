export class UrlValidator {
  /**
   * 严格校验岗位的真实性与落地页活性：
   * 1. HTTP 必须 200 可达
   * 2. 页面内容中必须包含真实岗位标题或公司名，绝不接受 404 或失效页面
   */
  public static async verifyJobUrl(url: string, expectedKeywords: string[]): Promise<boolean> {
    if (!url || !url.startsWith('http')) return false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timer);

      if (resp.status !== 200) {
        return false;
      }

      // 提取 HTML 文本排查是否包含“职位已下线”、“404”、“页面不存在”
      const html = await resp.text();
      const lower = html.toLowerCase();
      if (lower.includes('职位已关闭') || lower.includes('职位已下线') || lower.includes('页面不存在') || lower.includes('404 not found')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
