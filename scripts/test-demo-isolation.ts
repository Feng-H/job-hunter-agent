import { CollectorServer } from '../src/modules/server/CollectorServer.js';
import { JobHunterCore } from '../src/index.js';

async function runTests() {
  const testPort = 8799;
  const agent = new JobHunterCore();
  const server = new CollectorServer(agent, testPort);
  await server.start();
  console.log(`[Test] Server started on port ${testPort}`);

  const baseUrl = `http://127.0.0.1:${testPort}`;

  // 1. 测试未登录状态
  console.log('--- 1. 测试未登录访客身份 ---');
  const statusRes = await fetch(`${baseUrl}/auth/status`);
  const status = await statusRes.json() as any;
  console.log('auth/status:', status);
  if (!status.isDemo || status.loggedIn) throw new Error('Expected isDemo=true, loggedIn=false');

  // 2. 测试 Demo 数据隔离
  console.log('--- 2. 测试 Demo 岗位数据隔离 ---');
  const jobsRes = await fetch(`${baseUrl}/api/jobs`);
  const jobsData = await jobsRes.json() as any;
  console.log('jobs count:', jobsData.jobs.length, 'isDemo:', jobsData.isDemo);
  if (!jobsData.isDemo || jobsData.jobs.length === 0) throw new Error('Failed Demo jobs check');
  if (!jobsData.jobs.some((j: any) => j.job.id.startsWith('demo-'))) throw new Error('Expected demo-job prefix');

  // 3. 测试 LLM 配置隔离（访客绝不可查到真实 Key）
  console.log('--- 3. 测试 LLM 配置脱敏保护 ---');
  const llmRes = await fetch(`${baseUrl}/api/config/llm`);
  const llmData = await llmRes.json() as any;
  console.log('llmConfig (Demo):', llmData);
  if (llmData.hasKey !== false || llmData.apiKey !== '••••••••') {
    throw new Error('Leak of LLM key in demo mode!');
  }

  // 4. 测试 Demo 模式下严禁修改配置 (POST /api/config/llm 应当 403)
  console.log('--- 4. 测试 Demo 模式下禁止保存修改 ---');
  const feishuPostRes = await fetch(`${baseUrl}/api/config/feishu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl: 'https://evil.com' })
  });
  console.log('feishu POST status:', feishuPostRes.status);
  if (feishuPostRes.status !== 403) throw new Error('Expected 403 Forbidden for config modification in Demo mode');

  // 5. 测试 Demo 模式下 AI 对话安全 Mock
  console.log('--- 5. 测试 Demo AI 模拟对话沙箱 ---');
  const chatRes = await fetch(`${baseUrl}/api/profile/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '请帮我优化工作经历' })
  });
  const chatData = await chatRes.json() as any;
  console.log('Demo Chat Reply:', chatData.reply?.slice(0, 50) + '...');
  if (!chatData.reply?.includes('Demo 演示')) throw new Error('Expected Demo sandbox chat reply');

  // 6. 测试主页是否正常渲染（未登录不强跳 login）
  console.log('--- 6. 测试 Demo 主页可直接访问 ---');
  const indexHtmlRes = await fetch(`${baseUrl}/`);
  const html = await indexHtmlRes.text();
  if (indexHtmlRes.status !== 200 || !html.includes('Job-Hunter OS')) {
    throw new Error('Index HTML failed to serve');
  }

  // 7. 测试官网雷达 Demo 隔离
  console.log('--- 7. 测试官网直投雷达 (Demo 只读) ---');
  const radarGetRes = await fetch(`${baseUrl}/api/radar/portals`);
  const radarData = await radarGetRes.json() as any;
  console.log('radar portals (Demo GET):', radarData.portals?.length, '个门户, isDemo:', radarData.isDemo);
  if (radarData.code !== 0 || !radarData.isDemo || (radarData.portals?.length || 0) === 0) {
    throw new Error('Demo radar GET failed');
  }

  const radarPostRes = await fetch(`${baseUrl}/api/radar/portals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: '长沙' })
  });
  console.log('radar POST (Demo) status:', radarPostRes.status, '(预期 403，禁止 Demo 消耗 LLM)');
  if (radarPostRes.status !== 403) {
    throw new Error('Demo radar POST should be 403');
  }

  // 8. 验证扩展文件与书签静态资源可访问性
  console.log('--- 8. 验证采集器静态资源 ---');
  const bookmarkletRes = await fetch(`${baseUrl}/bookmarklet.js`);
  console.log('bookmarklet.js status:', bookmarkletRes.status);
  if (bookmarkletRes.status !== 200) throw new Error('bookmarklet.js missing');

  // 9. 验证猎头帖企业溯源权限隔离（Demo 禁止消耗 LLM）
  console.log('--- 9. 测试猎头帖企业溯源 Demo 隔离 ---');
  const resolveRes = await fetch(`${baseUrl}/api/jobs/any-job/resolve-company`, { method: 'POST' });
  console.log('resolve-company (Demo) status:', resolveRes.status, '(预期 403)');
  if (resolveRes.status !== 403) throw new Error('Demo resolve-company should be 403');

  // 10. 验证职位指纹匹配纯函数逻辑（官方帖 vs 猎头帖同岗匹配）
  console.log('--- 10. 验证职位指纹跨源匹配逻辑 ---');
  const { CompanyResolver, buildPositionFingerprint, normalizeTitle, normalizeSalaryBand } = await import('../src/modules/discovery/CompanyResolver.js');
  const t1 = normalizeTitle('【急聘】资深全栈工程师 25-50K');
  const t2 = normalizeTitle('全栈工程师');
  console.log(`normalizeTitle('【急聘】资深全栈工程师 25-50K') = '${t1}'`);
  console.log(`normalizeTitle('全栈工程师') = '${t2}'`);

  const s1 = normalizeSalaryBand('25-50K·14薪');
  const s2 = normalizeSalaryBand('25k-50k');
  console.log(`normalizeSalaryBand('25-50K·14薪') = ${s1}, normalizeSalaryBand('25k-50k') = ${s2} (应相等)`);
  if (s1 !== s2) throw new Error('Salary band normalization mismatch');

  const fp1 = buildPositionFingerprint({
    title: '【急聘】全栈工程师', company: '某知名互联网公司', city: '长沙·岳麓区',
    workMode: 'ONSITE', salaryText: '25-50K·14薪', description: 'x', url: 'https://a.com', platform: 'LIEPIN', discoveredAt: ''
  } as any);
  const fp2 = buildPositionFingerprint({
    title: '全栈工程师', company: '万兴科技', city: '长沙',
    workMode: 'ONSITE', salaryText: '25k-50k', description: 'x', url: 'https://b.com', platform: 'LIEPIN', discoveredAt: ''
  } as any);
  console.log('猎头帖指纹:', fp1);
  console.log('官方帖指纹:', fp2);
  if (fp1 !== fp2) throw new Error('Position fingerprints should match for the same job');

  // 11. 验证服务端防重指纹：同一岗位列表页 URL（带追踪参数）与详情页 URL 指纹一致
  console.log('--- 11. 验证服务端指纹 URL 归一化去重 ---');
  const { JobTracker } = await import('../src/modules/tracker/JobTracker.js');
  const tracker = new JobTracker('data/test_fingerprint_check.json');
  await tracker.ensureReady();

  const listUrlFp = tracker.generateFingerprint('万兴科技', '全栈工程师', 'https://www.zhipin.com/job_detail/abc123.html?lid=jlist_9&securityId=xyz');
  const detailUrlFp = tracker.generateFingerprint('万兴科技', '全栈工程师', 'https://www.zhipin.com/job_detail/abc123.html?lid=search_3&query=test');
  const trailingSlashFp = tracker.generateFingerprint('万兴科技', '全栈工程师', 'https://www.zhipin.com/job_detail/abc123.html');
  console.log('列表页 URL 指纹: ', listUrlFp);
  console.log('详情页 URL 指纹: ', detailUrlFp);
  console.log('无参数 URL 指纹:  ', trailingSlashFp);
  if (listUrlFp !== detailUrlFp || listUrlFp !== trailingSlashFp) {
    throw new Error('URL normalization dedup failed: same job should produce identical fingerprints');
  }

  // 大小写主机名与尾斜杠一致性
  const caseFp = tracker.generateFingerprint('万兴科技', '全栈工程师', 'https://WWW.ZHIPIN.COM/job_detail/abc123.html');
  if (caseFp !== trailingSlashFp) throw new Error('Host case normalization failed');

  // 不同岗位必须不同指纹（防误合并）
  const otherFp = tracker.generateFingerprint('万兴科技', '算法工程师', 'https://www.zhipin.com/job_detail/other456.html');
  if (otherFp === trailingSlashFp) throw new Error('Different jobs must have different fingerprints');

  console.log('\n🎉 所有测试通过！Demo 隔离 + 官网雷达 + 采集器 + 企业溯源 + 自动去重 100% 验证成功！');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
