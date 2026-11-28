export const facultyFields = {
  employeeId: 'د کارکوونکي شمېره', fullName: 'بشپړ نوم', department: 'څانګه',
  academicRank: 'علمي رتبه', employmentStatus: 'د دندې حالت', email: 'برېښنالیک', phone: 'د اړیکې شمېره',
};
export const canManageFaculty = (role) => ['system_admin', 'directorate_staff'].includes(role);
export const canArchiveFaculty = (role) => role === 'system_admin';

export function facultyValues(record = {}) {
  return Object.fromEntries(Object.keys(facultyFields).map((field) => [field, record[field] ?? (field === 'employmentStatus' ? 'active' : '')]));
}

function normalized(values) {
  const fields = Object.fromEntries(Object.keys(facultyFields).map((field) => [field, String(values[field] ?? '').trim()]));
  fields.employeeId = fields.employeeId.toUpperCase();
  fields.email = fields.email.toLowerCase();
  return fields;
}

export function facultyPayload(values, original) {
  const next = normalized(values);
  if (!original) return Object.fromEntries(Object.entries(next).filter(([field, value]) => !['email', 'phone'].includes(field) || value !== ''));
  const previous = normalized(facultyValues(original));
  // PATCH only edited fields. Preserve user links, education, history, and documents.
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => value !== previous[field]));
}

export function validateFaculty(values) {
  const errors = {};
  const fields = normalized(values);
  for (const [field, min, max] of [['employeeId', 1, 50], ['fullName', 2, 100], ['department', 1, 150]]) {
    if (fields[field].length < min || fields[field].length > max) errors[field] = `${facultyFields[field]} باید له ${min} تر ${max} تورو وي.`;
  }
  if (!['lecturer', 'senior_lecturer', 'associate_professor', 'professor'].includes(fields.academicRank)) errors.academicRank = 'علمي رتبه وټاکئ.';
  if (!['active', 'on_leave', 'retired', 'terminated'].includes(fields.employmentStatus)) errors.employmentStatus = 'د دندې حالت وټاکئ.';
  if (fields.phone.length > 30) errors.phone = 'د اړیکې شمېره باید تر ۳۰ تورو زیاته نه وي.';
  return errors;
}
