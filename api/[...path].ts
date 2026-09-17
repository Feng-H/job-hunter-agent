import type { IncomingMessage, ServerResponse } from 'node:http';
import { CollectorServer } from '../src/modules/server/CollectorServer.js';

// 捕获全部路由函数（/api/**）：文件名使用 [...path] 捕获组而非 index，
// 避免与 public/index.html 同名导致 "/" 根路由被函数抢占
let serverInstance: CollectorServer | null = null;

function getServerInstance(): CollectorServer {
  if (!serverInstance) {
    serverInstance = new CollectorServer();
  }
  return serverInstance;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const server = getServerInstance();
  await server.handle(req, res);
}
