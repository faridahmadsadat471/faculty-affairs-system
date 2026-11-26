import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const magic = Buffer.from('FA-BACKUP-1\n'), ivLength = 12, tagLength = 16;
const fileKey = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.pdf$/;
const restoreName = /^faculty_affairs_restore_[a-z0-9_]{1,60}$/;
const encode = (record) => EJSON.stringify(record, { relaxed: false }) + '\n';
function checkKey(key) { if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Backup key must contain exactly 32 bytes'); }
function requireOffline(offline) { if (offline !== true) throw new Error('Stop all writers and explicitly confirm offline mode'); }

export async function createBackup({ db, uploadDirectory, outputFile, key, offline }) {
  checkKey(key); requireOffline(offline);
  const iv = randomBytes(ivLength), cipher = createCipheriv('aes-256-gcm', key, iv);
  const summary = { collections: 0, documents: 0, files: 0 };
  async function* records() {
    yield encode({ type: 'manifest', format: 1, database: db.databaseName, createdAt: new Date(), consistency: 'offline' });
    for (const info of await db.listCollections().toArray()) {
      if (info.name.startsWith('system.')) continue;
      if (info.type !== 'collection') throw new Error('Views require a separate backup policy');
      yield encode({ type: 'collection', name: info.name, options: info.options, indexes: await db.collection(info.name).indexes() });
      summary.collections++;
      for await (const value of db.collection(info.name).find()) { yield encode({ type: 'document', collection: info.name, value }); summary.documents++; }
    }
    let entries = [];
    try { entries = await readdir(uploadDirectory, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const entry of entries) {
      if (!entry.isFile() || !fileKey.test(entry.name)) throw new Error('Unexpected private upload entry; inspect storage before backing up');
      const filename = path.join(uploadDirectory, entry.name), info = await stat(filename);
      if (info.size > 2 * 1024 * 1024) throw new Error('Stored upload exceeds the supported file limit');
      const bytes = await readFile(filename);
      yield encode({ type: 'file', key: entry.name, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') });
      summary.files++;
    }
    yield encode({ type: 'end', ...summary });
  }
  await mkdir(path.dirname(outputFile), { recursive: true });
  const output = createWriteStream(outputFile, { flags: 'wx', mode: 0o600 });
  let created = false;
  output.once('open', () => { created = true; });
  output.write(Buffer.concat([magic, iv]));
  try {
    await pipeline(Readable.from(records()), createGzip(), cipher, output);
    await appendFile(outputFile, cipher.getAuthTag());
    return summary;
  } catch (error) {
    if (created) await unlink(outputFile).catch(() => {});
    throw error;
  }
}

async function decryptSource(inputFile, key) {
  const info = await stat(inputFile), headerSize = magic.length + ivLength;
  if (info.size < headerSize + tagLength) throw new Error('Invalid backup archive');
  const handle = await open(inputFile, 'r');
  const header = Buffer.alloc(headerSize), tag = Buffer.alloc(tagLength);
  try { await handle.read(header, 0, headerSize, 0); await handle.read(tag, 0, tagLength, info.size - tagLength); } finally { await handle.close(); }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported backup format');
  const cipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length)); cipher.setAuthTag(tag);
  return [createReadStream(inputFile, { start: headerSize, end: info.size - tagLength - 1 }), cipher, createGunzip()];
}

export async function restoreBackup({ client, inputFile, uploadDirectory, databaseName, key, offline }) {
  checkKey(key); requireOffline(offline);
  if (!restoreName.test(databaseName)) throw new Error('Restore requires a new faculty_affairs_restore_ database name');
  const db = client.db(databaseName);
  if ((await db.listCollections().toArray()).length) throw new Error('Restore target database must be empty');
  try { await stat(uploadDirectory); throw new Error('Restore upload directory must not already exist'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Authenticate the entire encrypted stream before creating collections or files.
  let verifiedBytes = 0;
  await pipeline(...await decryptSource(inputFile, key), new Writable({ write(chunk, encoding, done) {
    verifiedBytes += chunk.length; done(verifiedBytes > 32 * 1024 ** 3 ? new Error('Backup exceeds the supported restore size') : undefined);
  } }));
  // Creating this collection is atomic, so simultaneous restores cannot own one target.
  await db.createCollection('__restore_lock');
  if ((await db.listCollections().toArray()).length !== 1) {
    await db.collection('__restore_lock').drop();
    throw new Error('Restore target was changed by another writer');
  }
  const parent = path.resolve(path.dirname(uploadDirectory));
  const staging = path.join(parent, '.faculty-restore-' + randomUUID());
  await mkdir(parent, { recursive: true }); await mkdir(staging, { mode: 0o700 });
  const summary = { collections: 0, documents: 0, files: 0 }, collections = new Map();
  let manifest, completed = false;
  const streams = await decryptSource(inputFile, key), source = streams.at(-1);
  const transferring = pipeline(...streams); transferring.catch(() => {});
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.length > 24 * 1024 * 1024 || completed) throw new Error('Invalid backup record');
      const record = EJSON.parse(line, { relaxed: false });
      if (!manifest) {
        if (record.type !== 'manifest' || Number(record.format) !== 1 || record.consistency !== 'offline' || record.database === databaseName) throw new Error('Invalid backup manifest or restore target');
        manifest = record; continue;
      }
      if (record.type === 'collection') {
        if (typeof record.name !== 'string' || record.name === '__restore_lock' || !/^[A-Za-z0-9_]+$/.test(record.name) || collections.has(record.name)) throw new Error('Invalid collection name');
        await db.createCollection(record.name, record.options || {}); collections.set(record.name, record.indexes); summary.collections++;
      } else if (record.type === 'document') {
        if (!collections.has(record.collection)) throw new Error('Unknown backup collection');
        await db.collection(record.collection).insertOne(record.value); summary.documents++;
      } else if (record.type === 'file') {
        if (!fileKey.test(record.key) || typeof record.data !== 'string' || record.data.length > 3 * 1024 * 1024) throw new Error('Invalid backup file');
        const bytes = Buffer.from(record.data, 'base64');
        if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('Upload checksum mismatch');
        await writeFile(path.join(staging, record.key), bytes, { flag: 'wx', mode: 0o600 }); summary.files++;
      } else if (record.type === 'end') {
        for (const field of Object.keys(summary)) if (Number(record[field]) !== summary[field]) throw new Error('Backup count mismatch');
        completed = true;
      } else throw new Error('Unknown backup record');
    }
    await transferring;
    if (!completed) throw new Error('Incomplete backup archive');
    for (const [name, indexes] of collections) {
      for (const { key: indexKeys, name: indexName, ...options } of indexes) {
        if (indexName === '_id_') continue;
        const allowed = {};
        for (const key of ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation', 'hidden', 'wildcardProjection']) if (options[key] !== undefined) allowed[key] = options[key];
        await db.collection(name).createIndex(indexKeys, { ...allowed, name: indexName });
      }
    }
    if (collections.has('users')) await db.collection('users').updateMany({}, { $inc: { tokenVersion: 1 }, $unset: { passwordResetHash: '', passwordResetExpiresAt: '', passwordResetVersion: '' } });
    await db.collection('__restore_lock').drop();
    await rename(staging, uploadDirectory);
    return { ...summary, databaseName, uploadDirectory, sessionsInvalidated: true };
  } catch (error) {
    source.destroy(); await transferring.catch(() => {});
    if (!restoreName.test(databaseName)) throw new Error('Unsafe cleanup target');
    await db.dropDatabase();
    if (path.dirname(path.resolve(staging)) !== parent || !path.basename(staging).startsWith('.faculty-restore-')) throw new Error('Unsafe staging cleanup path');
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
