import { JobHunterCore } from './core.js';
import { CollectorServer } from './modules/server/CollectorServer.js';

async function main() {
  const agent = new JobHunterCore();
  const server = new CollectorServer(agent, 8765);
  await server.start();
}

main().catch(console.error);
