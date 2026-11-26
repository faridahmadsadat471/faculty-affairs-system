import Contract from '../models/contract.model.js';
import { recordController } from './record.controller.js';
import { officialRoles, preventSelfReview } from '../services/record-access.service.js';
import { httpError } from '../utils/http-error.js';
import { trackChanges } from '../middleware/audit.middleware.js';

export const contracts = recordController({
  Model: Contract, statusField: 'approvalStatus', writeRoles: officialRoles,
  edit(record) { if (record.approvalStatus !== 'draft') throw httpError(409, 'Only draft contracts can be edited'); },
});

export const contractWorkflow = contracts.wrap(async (req, res) => {
  if (!officialRoles.includes(req.user.role)) throw httpError(403, 'Only Directorate staff can process contracts');
  const record = await contracts.find(req);
  const { status, reviewNotes } = req.input;
  const transitions = { draft: ['pending'], pending: ['approved', 'rejected'] };
  if (!transitions[record.approvalStatus]?.includes(status)) throw httpError(409, 'Invalid contract status transition');
  if (status === 'pending') {
    if (reviewNotes !== undefined) throw httpError(400, 'Review notes belong to the approval decision');
    record.submittedAt = new Date();
  } else {
    await preventSelfReview(req.user, record.faculty);
    if (!reviewNotes?.trim()) throw httpError(400, 'Review notes are required');
    record.reviewNotes = reviewNotes; record.reviewedAt = new Date(); record.reviewedBy = req.user._id;
  }
  record.history.push({ action: 'status_changed', actor: req.user._id, at: new Date(), from: record.approvalStatus, to: status });
  trackChanges(req, { approvalStatus: record.approvalStatus }, { approvalStatus: status }, ['approvalStatus']);
  record.approvalStatus = status;
  await record.save();
  res.json({ message: 'Contract workflow updated', record: contracts.serialize(record) });
});

export const renewContract = contracts.wrap(async (req, res) => {
  if (!officialRoles.includes(req.user.role)) throw httpError(403, 'Only Directorate staff can renew contracts');
  const source = await contracts.find(req);
  if (source.approvalStatus !== 'approved') throw httpError(409, 'Only approved contracts can be renewed');
  if (new Date(req.input.startDate) <= source.endDate) throw httpError(400, 'Renewal must start after the previous contract ends');
  const record = await Contract.create({ ...req.input, faculty: source.faculty, renewedFrom: source._id, createdBy: req.user._id, history: [{ action: 'renewed', actor: req.user._id, at: new Date() }] });
  res.status(201).json({ message: 'Renewal draft created', record: contracts.serialize(record) });
});
