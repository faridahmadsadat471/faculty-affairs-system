import { randomUUID } from 'node:crypto';
import AuditLog from '../models/audit-log.model.js';

const safeFields = new Set(['fullName', 'email', 'role', 'isActive', 'user', 'employeeId', 'department', 'academicRank', 'phone', 'employmentStatus', 'education', 'employmentHistory', 'faculty', 'requestedRank', 'status', 'eligibilityStatus', 'eligibilityNotes', 'reviewNotes', 'effectiveDate', 'contractNumber', 'title', 'startDate', 'endDate', 'renewalReminderDate', 'notes', 'researchType', 'abstract', 'coAuthors', 'publicationVenue', 'doi', 'publicationUrl', 'keywords', 'publicationDate', 'awardType', 'awardingOrganization', 'dateReceived', 'description', 'referenceNumber']);
const objectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value : undefined;

// Persist an intent before a mutation, then its outcome before returning JSON.
// An interrupted request stays 'started' so an operator can reconcile it.
export function auditMutations(resource) {
  return async (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
    let entry;
    try {
      entry = await AuditLog.create({
        requestId: randomUUID(), actor: req.user?._id, resource,
        resourceId: objectId(req.params.id || req.params.recordId),
        action: `${req.method} ${req.path}`.replace(/[a-f\d]{24}/gi, ':id'), occurredAt: new Date(),
        fields: Object.keys(req.body || {}).filter((name) => safeFields.has(name)),
      });
    } catch {
      return res.status(503).json({ message: 'Audit storage is unavailable. No operation was started' });
    }
    res.set('X-Request-ID', entry.requestId);
    const sendJson = res.json.bind(res);
    res.json = async (data) => {
      try {
        await AuditLog.updateOne({ _id: entry._id }, { $set: {
          actor: req.user?._id || objectId(String(data?.user?.id || '')),
          resourceId: entry.resourceId || objectId(req.params.id || req.params.recordId) || objectId(String(data?.record?._id || data?.faculty?._id || data?.user?.id || data?.id || '')),
          outcome: res.statusCode < 400 ? 'succeeded' : res.statusCode < 500 ? 'rejected' : 'uncertain',
          statusCode: res.statusCode, completedAt: new Date(), changes: req.auditChanges || [],
        } });
        return sendJson(data);
      } catch {
        res.status(503);
        return sendJson({ message: 'Audit confirmation failed. The operation may have completed; reload before retrying', requestId: entry.requestId });
      }
    };
    next();
  };
}

export function trackChanges(req, before, after, names) {
  req.auditChanges = names.filter((field) => String(before[field] ?? '') !== String(after[field] ?? '')).map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}
