import AuditLog from '../models/audit-log.model.js';
import { httpError } from '../utils/http-error.js';

export async function listAuditLogs(req, res, next) {
  try {
    const allowed = ['page', 'limit', 'resource', 'resourceId', 'actor', 'outcome', 'from', 'to'];
    const filter = {}, page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
    for (const [key, value] of Object.entries(req.query)) {
      if (!allowed.includes(key) || typeof value !== 'string' || !value || value.length > 100) throw httpError(400, 'Invalid audit filter');
      if (['page', 'limit'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (key === 'limit' ? 100 : 1000000))) throw httpError(400, 'Invalid audit pagination');
      if (['resourceId', 'actor'].includes(key)) { if (!/^[a-f\d]{24}$/i.test(value)) throw httpError(400, 'Invalid audit identifier'); filter[key] = value; }
      if (key === 'resource') {
        if (!['auth', 'users', 'faculty', 'promotions', 'contracts', 'research', 'awards', 'documents'].includes(value)) throw httpError(400, 'Invalid audit resource');
        filter.resource = value;
      }
      if (key === 'outcome') {
        if (!['started', 'succeeded', 'rejected', 'uncertain'].includes(value)) throw httpError(400, 'Invalid audit outcome');
        filter.outcome = value;
      }
      if (['from', 'to'].includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw httpError(400, 'Invalid audit date');
    }
    if (req.query.from && req.query.to && req.query.from > req.query.to) throw httpError(400, 'Invalid audit date range');
    if (req.query.from || req.query.to) {
      filter.occurredAt = { ...(req.query.from ? { $gte: new Date(req.query.from) } : {}), ...(req.query.to ? { $lt: new Date(new Date(req.query.to).getTime() + 86400000) } : {}) };
    }
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
}
