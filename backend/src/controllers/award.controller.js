import Award from '../models/award.model.js';
import { recordController } from './record.controller.js';
import { officialRoles } from '../services/record-access.service.js';
import { httpError } from '../utils/http-error.js';
function checkAward(data, req) {
  if (data.awardType === 'award' && !officialRoles.includes(req.user.role)) throw httpError(403, 'Only Directorate staff can record official awards');
  if (data.dateReceived && new Date(data.dateReceived) > new Date()) throw httpError(400, 'Date received cannot be in the future');
}
export const awards = recordController({
  Model: Award, statusField: 'awardType', writeRoles: ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member'],
  create(data, faculty, req) { checkAward(data, req); },
  edit(record, req) { checkAward(record, req); checkAward(req.input, req); },
});
