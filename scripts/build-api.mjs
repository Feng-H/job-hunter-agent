// 将 Vercel 函数源码入口预构建为纯 ESM JavaScript：
//   src/api-entry.ts  ->  api/[...path].js
// 目的：跳过 @vercel/node 的 TS 转译（其产物在本项目模块图上出现 default export 形态无效），
// 直接提交可在 Node 20 上运行的等价 bundle（本地已用纯 Node 验证）。
import { build } from 'esbuild';

await build({
  entryPoints: ['src/api-entry.ts'],
  outfile: 'api/entry.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  legalComments: 'none',
  logLevel: 'info'
});

console.log('✅ Vercel 函数预构建完成: api/entry.js');
