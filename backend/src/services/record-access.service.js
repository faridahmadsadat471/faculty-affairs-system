import Faculty from '../models/faculty.model.js';
import { getFacultyReadFilter } from './faculty-access.service.js';
import { httpError } from '../utils/http-error.js';

export const officialRoles = ['system_admin', 'directorate_staff'];

export async function scopedFaculty(user, id) {
  const scope = await getFacultyReadFilter(user);
  const faculty = await Faculty.findOne({ $and: [scope, { _id: id }] });
  if (!faculty) throw httpError(404, 'Faculty not found');
  return faculty;
}

export async function recordScope(user, facultyId) {
  if (facultyId) return { faculty: (await scopedFaculty(user, facultyId))._id, deletedAt: null };
  const scope = await getFacultyReadFilter(user);
  return { faculty: { $in: await Faculty.distinct('_id', scope) }, deletedAt: null };
}

export async function preventSelfReview(user, facultyId) {
  if (!officialRoles.includes(user.role)) throw httpError(403, 'Only Directorate staff can review records');
  if (await Faculty.exists({ _id: facultyId, user: user._id })) throw httpError(403, 'You cannot review your own faculty record');
}
