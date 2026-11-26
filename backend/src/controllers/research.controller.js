import Research from '../models/research.model.js';
import { recordController } from './record.controller.js';
import { preventSelfReview } from '../services/record-access.service.js';
import { httpError } from '../utils/http-error.js';
import { trackChanges } from '../middleware/audit.middleware.js';

export const research = recordController({
  Model: Research, statusField: 'publicationStatus',
  writeRoles: ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member'],
  edit(record) { if (record.publicationStatus !== 'draft') throw httpError(409, 'Only draft research records can be edited'); },
});
export const researchWorkflow = research.wrap(async (req, res) => {
  const record = await research.find(req);
  const { status, publicationDate } = req.input;
  const transitions = { draft: ['submitted'], submitted: ['accepted'], accepted: ['published'] };
  if (!transitions[record.publicationStatus]?.includes(status)) throw httpError(409, 'Invalid research status transition');
  if (status !== 'submitted') await preventSelfReview(req.user, record.faculty);
  if (status === 'published') {
    if (!publicationDate || new Date(publicationDate) > new Date()) throw httpError(400, 'Provide a publication date that is not in the future');
    record.publicationDate = publicationDate;
  } else if (publicationDate !== undefined) throw httpError(400, 'Publication date belongs to the published status');
  record.history.push({ action: 'status_changed', actor: req.user._id, at: new Date(), from: record.publicationStatus, to: status });
  trackChanges(req, { publicationStatus: record.publicationStatus }, { publicationStatus: status }, ['publicationStatus']);
  record.publicationStatus = status;
  await record.save();
  res.json({ message: 'Research workflow updated', record: research.serialize(record) });
});
