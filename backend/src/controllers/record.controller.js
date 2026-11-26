import { recordScope, scopedFaculty } from '../services/record-access.service.js';
import { httpError, recordError } from '../utils/http-error.js';
import { escapeRegex } from '../utils/query.js';
import { trackChanges } from '../middleware/audit.middleware.js';

export function recordController({ Model, statusField, create, edit, writeRoles }) {
  const wrap = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { recordError(error, res, next); }
  };
  const find = async (req) => {
    const scope = await recordScope(req.user);
    const document = await Model.findOne({ $and: [scope, { _id: req.params.id }] });
    if (!document) throw httpError(404, 'Record not found');
    return document;
  };
  const canWrite = (req) => { if (!writeRoles.includes(req.user.role)) throw httpError(403, 'You cannot change these records'); };
  const serialize = (document) => document.toObject({ versionKey: false });
  return {
    find, wrap, serialize,
    list: wrap(async (req, res) => {
      const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
      const scope = await recordScope(req.user, req.query.faculty);
      const criteria = {};
      if (req.query.search) criteria[Model.schema.path('title') ? 'title' : 'requestedRank'] = new RegExp(escapeRegex(req.query.search), 'i');
      if (req.query.status) {
        const values = Model.schema.path(statusField)?.enumValues;
        if (!values?.includes(req.query.status)) throw httpError(400, 'Invalid status filter');
        criteria[statusField] = req.query.status;
      }
      const filter = { $and: [scope, criteria] };
      const [records, total] = await Promise.all([
        Model.find(filter).select('-__v').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ records, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }),
    get: wrap(async (req, res) => { res.json({ record: serialize(await find(req)) }); }),
    create: wrap(async (req, res) => {
      canWrite(req);
      const faculty = await scopedFaculty(req.user, req.input.faculty);
      const data = { ...req.input, createdBy: req.user._id };
      if (create) await create(data, faculty, req);
      const document = new Model(data);
      document.history.push({ action: 'created', actor: req.user._id, at: new Date() });
      await document.save();
      res.status(201).json({ message: 'Record created successfully', record: serialize(document) });
    }),
    update: wrap(async (req, res) => {
      canWrite(req);
      const document = await find(req);
      if (edit) await edit(document, req);
      trackChanges(req, document.toObject(), { ...document.toObject(), ...req.input }, ['awardType']);
      document.set(req.input);
      document.history.push({ action: 'updated', actor: req.user._id, at: new Date() });
      await document.save();
      res.json({ message: 'Record updated successfully', record: serialize(document) });
    }),
    archive: wrap(async (req, res) => {
      if (req.user.role !== 'system_admin') throw httpError(403, 'Only administrators can archive records');
      const document = await find(req);
      document.deletedAt = new Date();
      document.history.push({ action: 'archived', actor: req.user._id, at: new Date() });
      await document.save();
      res.json({ message: 'Record archived successfully', id: document._id });
    }),
  };
}
