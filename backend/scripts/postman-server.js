import { startApi } from '../test-support/api.js';

const api = await startApi('postman', { port: 5001 });
await api.account('system_admin', 'postman-admin@example.test');
console.log(`Isolated Postman API ready at ${api.baseUrl}`);
console.log('Use backend/postman/faculty-affairs.postman_collection.json. This server uses a temporary test database.');
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await api.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
