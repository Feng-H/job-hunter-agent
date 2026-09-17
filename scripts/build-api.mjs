// 将 Vercel 函数源码入口预构建为纯 ESM JavaScript：
//   src/api-entry.ts  ->  api/[...path].js
// 目的：跳过 @vercel/node 的 TS 转译（其产物在本项目模块图上出现 default export 形态无效），
// 直接提交可在 Node 20 上运行的等价 bundle（本地已用纯 Node 验证）。
import { build } from 'esbuild';

await build({
  entryPoints: ['src/api-entry.ts'],
  outfile: 'api/[...path].js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  footer: { js: 'if (module.exports && module.exports.default && Object.keys(module.exports).length === 1) { module.exports = module.exports.default; }' }, // 将 {default:fn} 折叠为 fn 本身（注意不能用 exports.default——module.exports 已被重赋值）
  // 仅外部化重依赖/需按需加载的包；unpdf 等纯 JS 依赖直接打进 bundle（避免 ESM-only 包在 Node20 运行时被 require 的兼容问题）
  external: ['playwright-core', 'playwright', 'dotenv', '@earendil-works/pi-coding-agent'],
  legalComments: 'none',
  logLevel: 'info'
});

console.log('✅ Vercel 函数预构建完成: api/[...path].js');
