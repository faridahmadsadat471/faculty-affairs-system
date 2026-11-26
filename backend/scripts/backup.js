import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import mongoose from 'mongoose';
import { createBackup, restoreBackup } from '../src/services/backup.service.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const keyFile = path.resolve(process.env.BACKUP_KEY_FILE || path.join(root, '.backup-key'));
const [command, ...args] = process.argv.slice(2);
async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000); socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
let client;
try {
  if (command === 'init-key') {
    await writeFile(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
    console.log('Backup key created. Keep a separate protected copy; do not upload it to GitHub.');
  } else {
    if (!['create', 'restore'].includes(command) || !args.includes('--offline')) throw new Error('Usage: npm run backup -- --offline OR npm run restore -- ARCHIVE NEW_DATABASE NEW_UPLOAD_DIRECTORY --offline');
    if (await listening(Number(process.env.PORT) || 5000) || await listening(5001)) throw new Error('Stop the application and Postman test server first. Backups require no writers.');
    const key = await readFile(keyFile);
    client = new mongoose.mongo.MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 }); await client.connect();
    const parameters = args.filter((value) => value !== '--offline');
    if (command === 'create') {
      if (parameters.length) throw new Error('Backup create does not accept additional arguments');
      const outputFile = path.join(root, 'backups', `faculty-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.fabak`);
      const result = await createBackup({ db: client.db(), uploadDirectory: path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads/private')), outputFile, key, offline: true });
      console.log(JSON.stringify({ outputFile, ...result }));
    } else {
      if (parameters.length !== 3) throw new Error('Provide archive path, new database name and new upload directory');
      const [inputFile, databaseName, uploadDirectory] = parameters;
      const result = await restoreBackup({ client, inputFile: path.resolve(inputFile), databaseName, uploadDirectory: path.resolve(uploadDirectory), key, offline: true });
      console.log(JSON.stringify(result));
      console.log('Verify the restored database and files before separately configuring the API to use them.');
    }
  }
} catch {
  console.error('Backup command failed. Check the command, offline state, key, archive integrity and empty restore targets. No secrets were printed.');
  process.exitCode = 1;
} finally { await client?.close(); }
