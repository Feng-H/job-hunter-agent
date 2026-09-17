import type { IncomingMessage, ServerResponse } from 'node:http';
import { CollectorServer } from './modules/server/CollectorServer.js';

// Vercel Serverless 函数源码入口：
// 由 scripts/build-api.mjs 用 esbuild 预构建为纯 ESM JavaScript（api/entry.js），
// 绕开 @vercel/node 对本模块图（含变量动态导入）的 TS 转译怪癖
// （曾导致 "Invalid export found in module /var/task/index.js"）。
// 文件名刻意避开 index（防止与 public/index.html 抢 "/" 路由）与 [] 括号（Node ESM 把 import 路径当 URL 解析，方括号为非法字符会 ERR_INVALID_URL）。

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
