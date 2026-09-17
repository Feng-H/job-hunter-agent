import type { IncomingMessage, ServerResponse } from 'node:http';
import { CollectorServer } from './modules/server/CollectorServer.js';

// Vercel Serverless 函数源码入口：
// 由 scripts/build-api.mjs 用 esbuild 预构建为纯 ESM JavaScript（api/[...path].js），
// 绕开 @vercel/node 对本模块图（含变量动态导入）的 TS 转译怪癖
// （曾导致 "Invalid export found in module /var/task/index.js"）。
// 文件名使用 [...path] 捕获组而非 index，避免与 public/index.html 同名抢占 "/" 路由。

let serverInstance: CollectorServer | null = null;

function getServerInstance(): CollectorServer {
  if (!serverInstance) {
    serverInstance = new CollectorServer();
  }
  return serverInstance;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const server = getServerInstance();
  await server.handle(req, res);
}
