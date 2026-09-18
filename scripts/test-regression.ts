/**
 * 全面回归测试：覆盖云端部署以来出现过的每一类故障，防止复发。
 *
 *   事故类别                        → 对应测试组
 *   账号静默丢失（写入假成功）        → G1 auth 持久化 + 读改写合并
 *   多实例旧快照互相覆盖（会话丢失）   → G1 双实例会话并存
 *   设置保存丢字段（targetCities 等） → G2 偏好全字段往返
 *   过滤器读 example.json 北京配置    → G3 规则必须来自存储层
 *   硬红线与低分门槛混淆             → G4 hardFailed 语义
 *   详情 JD 无法富化已有岗位          → G5 enrichment
 *   前端调用了不存在的接口（档案404）  → G6 前后端契约静态扫描
 *   KV 429/网络抖动静默失败           → G7 重试
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  cond ? pass++ : fail++;
};

async function main() {
  // ============ G7 + G3 前置：伪造 KV 环境 + mock fetch ============
  process.env.KV_REST_API_URL = 'https://fake-kv.test';
  process.env.KV_REST_API_TOKEN = 'fake-token';
  let fetchCalls = 0;
  let nextResponses: Array<{ status: number; body: any }> = [];
  const kvStore = new Map<string, string>();
  const realFetch = global.fetch;
  (global as any).fetch = async (url: string, init?: any) => {
    fetchCalls++;
    if (nextResponses.length > 0) {
      const r = nextResponses.shift();
      return new Response(r!.body, { status: r!.status });
    }
    const u = String(url);
    if (u.includes('/set/')) {
      const key = decodeURIComponent(u.split('/set/')[1]);
      kvStore.set(key, init?.body ?? '');
      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    }
    if (u.includes('/get/')) {
      const key = decodeURIComponent(u.split('/get/')[1]);
      const val = kvStore.get(key) ?? null;
      return new Response(JSON.stringify({ result: val }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };

  const { getKvEnvConfig, readJsonStrict } = await import('../src/storage/index.js');

  // G7: 429 自动重试
  nextResponses = [{ status: 429, body: 'rate limited' }];
  const { writeJson } = await import('../src/storage/index.js');
  await writeJson('data/test_retry.json', { ok: 1 });
  check('G7 KV 写入遇 429 自动重试成功', kvStore.get('data/test_retry.json')?.includes('"ok": 1'));

  // G1: 双实例会话并存（多实例读-改-写防覆盖）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jhos-reg-'));
  const savedCwd = process.cwd();
  const { AuthService } = await import('../src/modules/auth/AuthService.js');
  const stateKey = 'data/auth/auth_state.json';

  // 实例 A：注册 + 登录（签发会话 1）
  const svcA = new AuthService();
  await svcA.ensureReady();
  const created = await svcA.createAccount('admin', 'password12345');
  check('G1 注册成功且落库', created.ok && kvStore.get(stateKey)?.includes('"admin"'));

  // 实例 B：模拟另一个 lambda 实例（内存独立），登录签发会话 2
  const svcB = new AuthService();
  await svcB.ensureReady();
  const loginB = await svcB.login('admin', 'password12345', '10.0.0.2');
  check('G1 实例 B 登录成功', loginB.ok);

  // 关键：A 的会话不被 B 的写入覆盖（读-改-写合并后两份会话并存）
  const svcA2 = new AuthService(); // 再起一个实例读 KV
  await svcA2.ensureReady();
  await svcA2.maybeRefresh();
  check('G1 双实例会话并存（无互相覆盖）', svcA2.validateSession(created.sessionToken) === 'admin' && svcA2.validateSession(loginB.sessionToken) === 'admin');

  // G1: 损坏锁定
  kvStore.set(stateKey, '{CORRUPT');
  const svcC = new AuthService();
  await svcC.ensureReady();
  check('G1 状态损坏时锁定注册', !svcC.isSetupMode() && !(await svcC.createAccount('x', 'password12345')).ok);
  kvStore.set(stateKey, kvStore.get(stateKey) || '{}'); // 清理

  process.chdir(savedCwd);

  // G2: 偏好全字段往返
  const { applyPreferencesUpdate } = await import('../src/modules/server/PreferencesService.js');
  const before = { scenarios: { remote: { salaryRange: { min: 15000 } }, onsite: { targetCities: ['北京'], salaryRange: { min: 15000 } } }, strictRules: {} };
  const after = applyPreferencesUpdate(structuredClone(before), {
    targetCities: ['长沙', '武汉'], homeBase: '松雅湖南地铁站', commuteMax: 60,
    salaryMin: 12000, doubleWeekend: true, disallowedWorkSchedules: ['单休', '大小周'],
    maxStaleMonths: 2, excludeKeywords: ['驻场'], excludeCompanies: ['某外包'],
    targetDomains: ['AI', '智能制造'], targetRoles: ['产品经理'],
    minScoreToNotify: 60, remoteEnabled: true, onsiteEnabled: true
  });
  check('G2 目标城市持久化', JSON.stringify(after.scenarios.onsite.targetCities) === JSON.stringify(['长沙', '武汉']));
  check('G2 常住地/通勤持久化', after.scenarios.onsite.homeBase === '松雅湖南地铁站' && after.scenarios.onsite.maxCommuteMinutes === 60);
  check('G2 薪资同步双场景', after.scenarios.onsite.salaryRange.min === 12000 && after.scenarios.remote.salaryRange.min === 12000);
  check('G2 红线全字段持久化', after.strictRules.maxStaleMonths === 2 && after.strictRules.excludeKeywords[0] === '驻场' && after.strictRules.excludeCompanies[0] === '某外包' && after.strictRules.mustDoubleWeekend === true);
  check('G2 目标行业/职位/评分门槛持久化', after.strictRules.targetDomains.length === 2 && after.scenarios.onsite.targetRoles[0] === '产品经理' && after.scoringThresholds.minScoreToNotify === 60);

  // G3 + G4: 过滤器规则来自存储层 + hardFailed 语义
  kvStore.set('data/preferences/rules.json', JSON.stringify({
    strictRules: { mustDoubleWeekend: true, disallowedWorkSchedules: ['单休'], maxStaleMonths: 3, excludeKeywords: ['驻场'] },
    scenarios: { remote: { enabled: true, salaryRange: { min: 15000 } }, onsite: { enabled: true, targetCities: ['长沙'], homeBase: '松雅湖南地铁站', maxCommuteMinutes: 90, salaryRange: { min: 8000 } } },
    scoringThresholds: { minScoreToNotify: 95 } // 门槛设 95：好岗位也只能低分 → 验证软门槛
  }));
  const { JobFilter } = await import('../src/modules/filter/JobFilter.js');
  const filter = new JobFilter();
  await filter.refreshRules();
  const profile = { basicInfo: { name: '测试', title: '产品经理' }, skills: { aiAndDigitalization: [], industrialEngineering: [], projectManagement: [] } } as any;
  const mkJob = (over: any = {}) => ({ title: '产品经理', company: '长沙某公司', city: '长沙', salaryText: '1-2万', salaryMax: 20000, workMode: 'ONSITE', description: '负责智能制造数字化转型', publishOrActiveTime: new Date().toISOString(), url: 'https://t.test/1', ...over });

  const softGate = filter.evaluate(mkJob(), profile);
  check('G3 规则来自存储层（命中长沙场景）', softGate.reasons.some((r: string) => r.includes('长沙')));
  check('G4 零红线低分 → hardFailed=false（留板待复核）', !softGate.passed && softGate.hardFailed === false);

  const hardCity = filter.evaluate(mkJob({ city: '上海', company: '某科技公司' }), profile);
  check('G4 地点不符 → hardFailed=true', !hardCity.passed && hardCity.hardFailed === true);

  const hardSchedule = filter.evaluate(mkJob({ description: '单休 大小周轮换' }), profile);
  check('G4 单休红线 → hardFailed=true', !hardSchedule.passed && hardSchedule.hardFailed === true);

  const hardSalary = filter.evaluate(mkJob({ salaryMax: 5000 }), profile);
  check('G4 薪资低于底线 → hardFailed=true', !hardSalary.passed && hardSalary.hardFailed === true);

  const hardKw = filter.evaluate(mkJob({ description: '驻场开发' }), profile);
  check('G4 黑名单关键词 → hardFailed=true', !hardKw.passed && hardKw.hardFailed === true);

  // G5: 详情 JD 富化
  process.chdir(tmp);
  delete process.env.KV_REST_API_URL; // 富化测试走本地文件存储
  delete process.env.KV_REST_API_TOKEN;
  const { JobHunterCore } = await import('../src/core.js');
  const core = new JobHunterCore();
  await core['tracker'].ensureReady(); // 等待构造期异步加载完成，否则注册的记录会被晚到的空库快照覆盖
  const thin = { id: '', title: '设备专家', company: '长沙某制造企业', city: '长沙', workMode: 'ONSITE' as const, salaryText: '1.5-3万', salaryMax: 30000, description: '岗位描述', url: 'https://z.test/job/1', platform: 'ZHAOPIN', publishOrActiveTime: new Date().toISOString(), discoveredAt: new Date().toISOString() };
  thin.id = core['tracker'].generateFingerprint(thin.company, thin.title, thin.url);
  core['tracker'].registerDiscoveredJob(thin as any);

  const noChange = await core.enrichExistingJob({ ...thin, description: '更短的' });
  check('G5 更贫瘠的数据不触发富化', noChange === false);

  const rich = { ...thin, description: '一、岗位基本信息\n设备健康管理智能化，PHM 预测性维护，负责智能制造数字化转型方案的标准化与产品化落地。'.repeat(5), detailCaptured: true };
  const enriched = await core.enrichExistingJob(rich as any);
  const record = core['tracker'].getRecord(thin.id);
  check('G5 全量 JD 富化入库并重评', enriched === true && (record!.job.description || '').length > 200 && record!.statusHistory.some(h => h.note?.includes('重新初筛')));
  process.chdir(savedCwd);

  // G6: 前后端接口契约静态扫描
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../src/modules/server/CollectorServer.ts'), 'utf-8');
  const htmlFiles = ['index.html', 'setup.html', 'onboarding.html', 'login.html'].map(f => path.resolve(__dirname, '../public/', f));
  const endpoints = new Set<string>();
  for (const f of htmlFiles) {
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf-8');
    for (const m of html.matchAll(/['"`](\/(?:api|auth)\/[a-zA-Z0-9/_-]+)['"`]/g)) endpoints.add(m[1]);
  }
  const missing = Array.from(endpoints).filter(e => !serverSrc.includes(`'${e}'`) && !serverSrc.includes(`('${e}'`));
  check(`G6 前端 ${endpoints.size} 个接口全部有服务端实现（缺失: ${missing.join(', ') || '无'}）`, missing.length === 0);

  (global as any).fetch = realFetch;
  console.log(`\n回归结果: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
