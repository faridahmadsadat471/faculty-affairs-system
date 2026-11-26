import Promotion from '../models/promotion.model.js';
import { recordController } from './record.controller.js';
import { preventSelfReview } from '../services/record-access.service.js';
import { httpError } from '../utils/http-error.js';
import { trackChanges } from '../middleware/audit.middleware.js';

export const promotions = recordController({
  Model: Promotion, statusField: 'status',
  writeRoles: ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member'],
  create(data, faculty) { data.currentRank = faculty.academicRank; },
  edit(document) { if (document.status !== 'draft') throw httpError(409, 'Only draft promotions can be edited'); },
});

export const promotionWorkflow = promotions.wrap(async (req, res) => {
  const record = await promotions.find(req);
  const { status, ...assessment } = req.input;
  const transitions = { draft: ['submitted'], submitted: ['under_review'], under_review: ['approved', 'rejected'] };
  if (!transitions[record.status]?.includes(status)) throw httpError(409, 'Invalid promotion status transition');
  if (status === 'submitted') {
    if (Object.keys(assessment).length) throw httpError(403, 'Only reviewers may provide an assessment');
    record.submittedAt = new Date();
  } else {
    await preventSelfReview(req.user, record.faculty);
    record.set(assessment);
    if (['approved', 'rejected'].includes(status)) {
      if (!assessment.reviewNotes?.trim()) throw httpError(400, 'Review notes are required for a decision');
      record.reviewedBy = req.user._id;
      record.reviewedAt = new Date();
    }
  }
  record.history.push({ action: 'status_changed', actor: req.user._id, at: new Date(), from: record.status, to: status });
  trackChanges(req, { status: record.status }, { status }, ['status']);
  record.status = status;
  await record.save();
  res.json({ message: 'Promotion workflow updated', record: promotions.serialize(record) });
});
