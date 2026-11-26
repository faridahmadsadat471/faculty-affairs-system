import Faculty from '../models/faculty.model.js';
import Promotion from '../models/promotion.model.js';
import Contract from '../models/contract.model.js';
import Research from '../models/research.model.js';
import Award from '../models/award.model.js';
import { getFacultyReadFilter } from '../services/faculty-access.service.js';
import { recordScope } from '../services/record-access.service.js';
import { httpError } from '../utils/http-error.js';

function dateFilter(query, field) {
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lt = new Date(new Date(query.to).getTime() + 86400000);
  return Object.keys(range).length ? { [field]: range } : {};
}
async function groups(Model, filter, field) {
  const rows = await Model.aggregate([{ $match: filter }, { $group: { _id: '$' + field, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  return rows.map(({ _id, count }) => ({ value: _id, count }));
}

export async function summaryReport(req, res, next) {
  try {
    const facultyScope = await getFacultyReadFilter(req.user);
    const facultyFilter = { $and: [facultyScope, dateFilter(req.query, 'createdAt')] };
    const recordFilter = await recordScope(req.user);
    const filter = (field) => ({ $and: [recordFilter, dateFilter(req.query, field)] });
    const now = new Date(), soon = new Date(now.getTime() + 30 * 86400000);
    const [faculty, departments, ranks, employment, promotions, contracts, research, researchTypes, awards, expiringContracts, remindersDue] = await Promise.all([
      Faculty.countDocuments(facultyFilter), groups(Faculty, facultyFilter, 'department'), groups(Faculty, facultyFilter, 'academicRank'), groups(Faculty, facultyFilter, 'employmentStatus'),
      groups(Promotion, filter('createdAt'), 'status'), groups(Contract, filter('startDate'), 'approvalStatus'),
      groups(Research, filter('publicationDate'), 'publicationStatus'), groups(Research, filter('publicationDate'), 'researchType'), groups(Award, filter('dateReceived'), 'awardType'),
      Contract.countDocuments({ $and: [filter('startDate'), { approvalStatus: 'approved', endDate: { $gte: now, $lte: soon } }] }),
      Contract.countDocuments({ $and: [filter('startDate'), { approvalStatus: 'approved', renewalReminderDate: { $lte: now }, endDate: { $gte: now } }] }),
    ]);
    res.json({ generatedAt: now, filters: req.query, faculty: { total: faculty, departments, ranks, employment }, promotions, contracts: { statuses: contracts, expiringWithin30Days: expiringContracts, remindersDue }, research: { statuses: research, types: researchTypes }, awards });
  } catch (error) { next(error); }
}

export async function expiringContracts(req, res, next) {
  try {
    const scope = await recordScope(req.user), page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), days = Number(req.query.days || 30);
    const now = new Date(), until = new Date(now.getTime() + days * 86400000);
    const filter = { $and: [scope, { approvalStatus: 'approved', endDate: { $gte: now, $lte: until } }] };
    const [records, total] = await Promise.all([Contract.find(filter).select('-__v').sort({ endDate: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), Contract.countDocuments(filter)]);
    res.json({ records, window: { from: now, to: until, days }, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function facultyCsv(req, res, next) {
  try {
    const scope = await getFacultyReadFilter(req.user);
    const records = await Faculty.find({ $and: [scope, dateFilter(req.query, 'createdAt')] }).select('employeeId fullName department academicRank employmentStatus').sort({ employeeId: 1 }).limit(10001).lean();
    if (records.length > 10000) throw httpError(413, 'Narrow the report date range to export at most 10000 faculty');
    const columns = ['employeeId', 'fullName', 'department', 'academicRank', 'employmentStatus'];
    const csv = [columns.map(csvCell).join(','), ...records.map((row) => columns.map((key) => csvCell(row[key])).join(','))].join('\r\n');
    res.set('Content-Disposition', 'attachment; filename="faculty-report.csv"').type('text/csv').send('\uFEFF' + csv);
  } catch (error) { next(error); }
}
