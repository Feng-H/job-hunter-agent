import { JobHunterCore } from './core.js';
import { CollectorServer } from './modules/server/CollectorServer.js';

async function main() {
  const agent = new JobHunterCore();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;
  const server = new CollectorServer(agent, port);
  await server.start();
}

main().catch(console.error);
