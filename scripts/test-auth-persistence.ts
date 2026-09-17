/**
 * AuthService 持久化完整性冒烟测试（在临时目录中运行，不触碰真实 data/）
 * 覆盖 2026-09 账号丢失事故的三个防护点：
 *   1. 注册必须真正落库且回读校验通过
 *   2. 实例重启后账号仍在（冷启动模拟）
 *   3. 状态文件损坏时锁定注册/登录，不假装空库
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'jhos-auth-test-')));

async function main() {
  const { AuthService } = await import('../src/modules/auth/AuthService.js');
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean) => {
    console.log(`${cond ? '✅' : '❌'} ${name}`);
    cond ? pass++ : fail++;
  };

  // --- 1. 注册：必须落库 + 回读校验 ---
  const svc1 = new AuthService();
  await svc1.ensureReady();
  const created = await svc1.createAccount('admin_test', 'password12345');
  check('注册成功', created.ok);
  const stateFile = path.resolve(process.cwd(), 'data/auth/auth_state.json');
  check('状态文件已写入磁盘', fs.existsSync(stateFile));
  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  check('账号已持久化到文件', persisted.accounts?.length === 1 && persisted.accounts[0].username === 'admin_test');

  // --- 2. 冷启动模拟：新实例重新加载 ---
  const svc2 = new AuthService();
  await svc2.ensureReady();
  check('重启后不再是初始化模式', svc2.isSetupMode() === false);
  const reCreate = await svc2.createAccount('another', 'password12345');
  check('已有账号时拒绝重复注册', !reCreate.ok);
  const loginOk = await svc2.login('admin_test', 'password12345', '127.0.0.1');
  check('重启后原密码可登录', loginOk.ok);
  const loginBad = await svc2.login('admin_test', 'wrong-password', '127.0.0.1');
  check('错误密码被拒绝', !loginBad.ok);

  // --- 3. 状态损坏：锁定而非假空库 ---
  fs.writeFileSync(stateFile, '{CORRUPTED_JSON', 'utf-8');
  const svc3 = new AuthService();
  await svc3.ensureReady();
  check('损坏时 storageHealth 报错', svc3.storageHealth().ok === false);
  check('损坏时不允许注册（防覆盖真数据）', svc3.isSetupMode() === false);
  const locked = await svc3.createAccount('hijack', 'password12345');
  check('损坏时注册被拒绝', !locked.ok && locked.message.includes('锁定'));
  const lockedLogin = await svc3.login('hijack', 'password12345', '127.0.0.1');
  check('损坏时登录被拒绝', !lockedLogin.ok);
  check('损坏的文件未被覆盖（真数据可抢救）', fs.readFileSync(stateFile, 'utf-8') === '{CORRUPTED_JSON');

  console.log(`\n结果: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
