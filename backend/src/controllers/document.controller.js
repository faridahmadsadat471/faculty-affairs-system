import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Faculty from '../models/faculty.model.js';
import Promotion from '../models/promotion.model.js';
import Contract from '../models/contract.model.js';
import Research from '../models/research.model.js';
import Award from '../models/award.model.js';
import { scopedFaculty, recordScope, officialRoles } from '../services/record-access.service.js';
import { httpError, recordError } from '../utils/http-error.js';

const modules = {
  faculty: { Model: Faculty, field: 'documents' },
  promotions: { Model: Promotion, field: 'supportingDocuments', status: 'status' },
  contracts: { Model: Contract, field: 'documents', status: 'approvalStatus' },
  research: { Model: Research, field: 'documents', status: 'publicationStatus' },
  awards: { Model: Award, field: 'documents' },
};
const storageKeyPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.pdf$/;
const defaultDirectory = new URL('../../uploads/private/', import.meta.url);
function directory() { return path.resolve(process.env.UPLOAD_DIR || fileURLToPath(defaultDirectory)); }
function filePath(key) {
  if (!storageKeyPattern.test(key)) throw httpError(404, 'Document not found');
  return path.join(directory(), key);
}

export async function documentAccess(req, res, next) {
  try {
    const config = modules[req.params.module];
    if (!config) throw httpError(404, 'Document module not found');
    if (![req.params.recordId, req.params.documentId].filter(Boolean).every((id) => /^[a-f\d]{24}$/i.test(id)) || Object.keys(req.query).length) throw httpError(400, 'Invalid document request');
    let record;
    if (req.params.module === 'faculty') record = await scopedFaculty(req.user, req.params.recordId);
    else {
      record = await config.Model.findOne({ $and: [await recordScope(req.user), { _id: req.params.recordId }] });
      if (!record) throw httpError(404, 'Record not found');
    }
    if (req.method === 'POST') {
      if (req.params.module === 'contracts' && !officialRoles.includes(req.user.role)) throw httpError(403, 'Only Directorate staff can upload contract documents');
      if (config.status && record[config.status] !== 'draft') throw httpError(409, 'Documents can be added only to draft records');
      if (req.params.module === 'awards' && record.awardType === 'award' && !officialRoles.includes(req.user.role)) throw httpError(403, 'Only Directorate staff can change official award documents');
      if (record[config.field].length >= 20) throw httpError(409, 'At most 20 documents are allowed per record');
    }
    req.documentTarget = { ...config, record };
    next();
  } catch (error) { next(error); }
}

export async function uploadDocument(req, res, next) {
  let writtenPath;
  try {
    const { record, field } = req.documentTarget;
    if (!req.file || typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 200 || Object.keys(req.body).some((key) => key !== 'title')) throw httpError(400, 'Provide one PDF file and a title of at most 200 characters');
    const bytes = req.file.buffer;
    if (!bytes.subarray(0, 8).toString('ascii').match(/^%PDF-1\.[0-9]|^%PDF-2\.0/) || !bytes.subarray(-1024).toString('ascii').trimEnd().endsWith('%%EOF')) throw httpError(400, 'The file must have a PDF header and end marker');
    const storageKey = randomUUID() + '.pdf';
    const destination = filePath(storageKey);
    await mkdir(directory(), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    writtenPath = destination;
    record[field].push({ title: req.body.title.trim(), storageKey, uploadedBy: req.user._id, uploadedAt: new Date(), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (record.history) record.history.push({ action: 'document_uploaded', actor: req.user._id, at: new Date() });
    await record.save();
    const document = record[field].at(-1).toObject();
    delete document.storageKey;
    return res.status(201).json({ message: 'PDF uploaded successfully', document });
  } catch (error) {
    if (writtenPath) await unlink(writtenPath).catch(() => {});
    recordError(error, res, next);
  }
}

export async function downloadDocument(req, res, next) {
  try {
    const { record, field } = req.documentTarget;
    const document = record[field].id(req.params.documentId);
    if (!document) throw httpError(404, 'Document not found');
    const filename = filePath(document.storageKey);
    const info = await stat(filename);
    if (!info.isFile()) throw httpError(404, 'Document not found');
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res.download(filename, 'document.pdf', { dotfiles: 'deny' }, (error) => { if (error) next(error); });
  } catch (error) {
    if (error.code === 'ENOENT') return next(httpError(404, 'Document file not found'));
    next(error);
  }
}
