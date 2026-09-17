import type { IncomingMessage, ServerResponse } from 'node:http';
import { CollectorServer } from '../src/modules/server/CollectorServer.js';

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
