export const roleNames = {
  system_admin: 'د سیستم مدیر', directorate_staff: 'د ریاست کارکوونکی',
  department_manager: 'د پوهنځي یا څانګې مدیر', faculty_member: 'استاد',
};
export const academicRanks = {
  lecturer: 'استاد', senior_lecturer: 'لوړپوړی استاد',
  associate_professor: 'مرستیال پروفیسور', professor: 'پروفیسور',
};
export const employmentStatuses = {
  active: 'په دنده کې', on_leave: 'په رخصتۍ کې', retired: 'متقاعد', terminated: 'دنده پای ته رسېدلې',
};
export const workflowStatuses = {
  draft: 'مسوده', submitted: 'سپارل شوی', under_review: 'تر ارزونې لاندې',
  approved: 'منظور شوی', rejected: 'رد شوی', pending: 'د منظورۍ په تمه',
  accepted: 'منل شوی', published: 'خپور شوی',
};
export const number = (value) => new Intl.NumberFormat('ps-AF').format(value ?? 0);
export function date(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('ps-AF-u-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
export const totalGroups = (rows = []) => rows.reduce((sum, row) => sum + row.count, 0);
export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('');
}
export function errorMessage(error) {
  if (error?.message === 'Department access is not configured') return 'ستاسې د حساب څانګه نه ده ټاکل شوې. د سیستم له مدیر سره اړیکه ونیسئ.';
  if (error?.status === 403) return 'دې معلوماتو ته د لاسرسي اجازه نه لرئ.';
  if (error?.status === 404) return 'غوښتل شوي معلومات ونه موندل شول. ښايي ریکارډ آرشیف شوی وي.';
  if (error?.status === 400 || error?.status === 422) return 'د لټون او فلټرونو ارزښتونه بیا وګورئ.';
  if (error?.status === 429) return 'غوښتنې ډېرې شوې. لږ وروسته بیا هڅه وکړئ.';
  return 'معلومات ترلاسه نه شول. اړیکه وګورئ او بیا هڅه وکړئ.';
}
