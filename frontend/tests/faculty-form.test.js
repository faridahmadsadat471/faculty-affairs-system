import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facultyPayload, facultyValues, validateFaculty, canManageFaculty, canArchiveFaculty } from '../src/utils/faculty-form.js';

const record = { employeeId: 'BU-7', fullName: 'Test Faculty', department: 'Computer Science', academicRank: 'lecturer', employmentStatus: 'active', email: 'old@example.test', phone: '000', education: [{ degree: 'Bachelor' }], employmentHistory: [{ position: 'Lecturer' }], documents: [{ title: 'Private document' }], user: 'linked-user' };
test('create payload is normalized, omits empty optional fields, and excludes unrelated data', () => {
  const values = { ...facultyValues(record), employeeId: ' bu-8 ', email: ' ', phone: '', fullName: ' Test Faculty ', role: 'system_admin', documents: [] };
  assert.deepEqual(facultyPayload(values), { employeeId: 'BU-8', fullName: 'Test Faculty', department: 'Computer Science', academicRank: 'lecturer', employmentStatus: 'active' });
});
test('editing only one field preserves linked accounts, education, history, and documents', () => {
  assert.deepEqual(facultyPayload({ ...facultyValues(record), fullName: 'Updated Faculty' }, record), { fullName: 'Updated Faculty' });
  assert.deepEqual(facultyPayload(facultyValues(record), record), {});
});
test('clearing an existing optional email is sent explicitly instead of silently retained', () => {
  assert.deepEqual(facultyPayload({ ...facultyValues(record), email: '', phone: '' }, record), { email: '', phone: '' });
});
test('trimmed required fields, maximum lengths, rank, and employment status are validated', () => {
  assert.deepEqual(validateFaculty(facultyValues(record)), {});
  const invalid = validateFaculty({ ...facultyValues(record), fullName: ' ', department: ' ', employeeId: 'x'.repeat(51), academicRank: 'unrecognized', employmentStatus: 'unrecognized', phone: 'x'.repeat(31) });
  assert.deepEqual(Object.keys(invalid).sort(), ['academicRank', 'department', 'employeeId', 'employmentStatus', 'fullName', 'phone'].sort());
});
test('only the administrator and directorate staff get faculty write controls', () => {
  assert.equal(canManageFaculty('system_admin'), true); assert.equal(canManageFaculty('directorate_staff'), true);
  for (const role of ['department_manager', 'faculty_member', undefined, 'unknown']) assert.equal(canManageFaculty(role), false);
});
test('archive controls are restricted to the system administrator, including denial for staff', () => {
  assert.equal(canArchiveFaculty('system_admin'), true);
  for (const role of ['directorate_staff', 'department_manager', 'faculty_member', undefined, 'unknown']) assert.equal(canArchiveFaculty(role), false);
});
