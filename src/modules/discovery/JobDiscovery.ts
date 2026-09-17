import { JobPost } from '../../types/index.js';

export interface JobDiscoverySource {
  name: string;
  fetchJobs(): Promise<JobPost[]>;
}

/**
 * 远程与真实社区渠道（电鸭/V2EX真实公开接口）
 * 绝不包含任何假数据或模拟数据
 */
export class CommunityJobSource implements JobDiscoverySource {
  public name = 'Remote Community Radar';

  async fetchJobs(): Promise<JobPost[]> {
    const jobs: JobPost[] = [];
    try {
      // 获取电鸭社区真实远程招聘 RSS/JSON
      const resp = await fetch('https://eleduck.com/api/v1/posts?category=job&sort=-published_at', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const posts = data?.posts || [];
        for (const p of posts) {
          if (!p.title || !p.summary) continue;
          jobs.push({
            id: `eleduck_${p.id}`,
            title: p.title,
            company: p.user?.nickname || '远程团队',
            city: '远程',
            workMode: 'REMOTE',
            salaryText: p.salary || '面议',
            description: `${p.title} ${p.summary}`,
            url: `https://eleduck.com/posts/${p.id}`,
            platform: 'ELEDUCK',
            discoveredAt: new Date().toISOString()
          });
        }
      }
    } catch {
      // 网络故障静默处理，绝不回退假数据
    }
    return jobs;
  }
}
