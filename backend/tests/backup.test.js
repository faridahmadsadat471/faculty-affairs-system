import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mongoose from 'mongoose';
import { startApi } from '../test-support/api.js';
import { testPdf } from '../test-support/pdf.js';
import { createBackup, restoreBackup } from '../src/services/backup.service.js';
let api, root, key, archive, uploadDirectory, sourceName;
const targets = [];
const name = () => { const value = 'faculty_affairs_restore_test_' + randomBytes(8).toString('hex'); targets.push(value); return value; };
before(async () => {
  api = await startApi('backup'); sourceName = api.dbName;
  root = await mkdtemp(path.join(os.tmpdir(), 'faculty-affairs-backup-test-')); uploadDirectory = path.join(root, 'source-files'); await mkdir(uploadDirectory);
  key = randomBytes(32); archive = path.join(root, 'test.fabak');
  await api.account('system_admin');
  await mongoose.connection.db.collection('typed_records').insertOne({ text: 'Backup verification', date: new Date('2026-01-01'), decimal: mongoose.mongo.BSON.Decimal128.fromString('12.50'), binary: new mongoose.mongo.BSON.Binary(Buffer.from('binary bytes')), active: true });
  await mongoose.connection.db.collection('typed_records').createIndex({ text: 1 }, { unique: true });
  await writeFile(path.join(uploadDirectory, randomUUID() + '.pdf'), testPdf());
});
after(async () => {
  const client = mongoose.connection.getClient();
  for (const databaseName of targets) { assert.match(databaseName, /^faculty_affairs_restore_test_[a-f0-9]{16}$/); await client.db(databaseName).dropDatabase(); }
  await api?.close();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('faculty-affairs-backup-test-'));
  await rm(root, { recursive: true, force: true });
});
test('encrypted offline backup and isolated restore preserve BSON types, indexes, PDFs and invalidate sessions', async () => {
  const source = mongoose.connection.db;
  const summary = await createBackup({ db: source, uploadDirectory, outputFile: archive, key, offline: true });
  assert.equal(summary.files, 1); assert.ok(summary.documents > 0);
  const bytes = await readFile(archive); assert.ok(!bytes.includes(Buffer.from('Backup verification'))); assert.ok(!bytes.includes(Buffer.from('%PDF')));
  const databaseName = name(), restoredUploads = path.join(root, 'restored');
  const result = await restoreBackup({ client: mongoose.connection.getClient(), inputFile: archive, uploadDirectory: restoredUploads, databaseName, key, offline: true });
  assert.equal(result.documents, summary.documents); assert.equal(result.sessionsInvalidated, true);
  const target = mongoose.connection.getClient().db(databaseName), record = await target.collection('typed_records').findOne();
  assert.equal(record.date.toISOString(), '2026-01-01T00:00:00.000Z'); assert.equal(record.decimal.toString(), '12.50'); assert.equal(record.binary.buffer.toString(), 'binary bytes');
  assert.ok((await target.collection('typed_records').indexes()).some((index) => index.unique && index.key.text === 1));
  const files = await readdir(restoredUploads); assert.deepEqual(await readFile(path.join(restoredUploads, files[0])), testPdf());
  assert.equal((await target.collection('users').findOne()).tokenVersion, 1);
  assert.equal(mongoose.connection.name, sourceName);
});
test('wrong keys and archive corruption fail before creating a restore database or upload directory', async () => {
  const databaseName = name(), destination = path.join(root, 'wrong-key');
  await assert.rejects(restoreBackup({ client: mongoose.connection.getClient(), inputFile: archive, uploadDirectory: destination, databaseName, key: randomBytes(32), offline: true }));
  assert.equal((await mongoose.connection.getClient().db(databaseName).listCollections().toArray()).length, 0);
  const corrupted = Buffer.from(await readFile(archive)); corrupted[corrupted.length - 1] ^= 1;
  const corruptedFile = path.join(root, 'corrupt.fabak'); await writeFile(corruptedFile, corrupted);
  await assert.rejects(restoreBackup({ client: mongoose.connection.getClient(), inputFile: corruptedFile, uploadDirectory: destination, databaseName, key, offline: true }));
  assert.equal((await mongoose.connection.getClient().db(databaseName).listCollections().toArray()).length, 0);
});
test('backup and restore refuse online mode, existing archives, unsafe names and occupied targets', async () => {
  await assert.rejects(createBackup({ db: mongoose.connection.db, uploadDirectory, outputFile: archive, key }), /offline/);
  const before = await readFile(archive);
  await assert.rejects(createBackup({ db: mongoose.connection.db, uploadDirectory, outputFile: archive, key, offline: true }));
  assert.deepEqual(await readFile(archive), before);
  for (const databaseName of ['faculty_affairs', 'admin', sourceName]) await assert.rejects(restoreBackup({ client: mongoose.connection.getClient(), inputFile: archive, uploadDirectory: path.join(root, 'blocked'), databaseName, key, offline: true }), /new faculty_affairs_restore_/);
  const databaseName = name(), db = mongoose.connection.getClient().db(databaseName); await db.collection('do_not_touch').insertOne({ keep: true });
  await assert.rejects(restoreBackup({ client: mongoose.connection.getClient(), inputFile: archive, uploadDirectory: path.join(root, 'occupied'), databaseName, key, offline: true }), /empty/);
  assert.equal(await db.collection('do_not_touch').countDocuments(), 1);
});
