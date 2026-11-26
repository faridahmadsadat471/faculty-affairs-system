import Faculty from '../models/faculty.model.js';

function forbidden(message = 'Access denied') {
  const error = new Error(message);
  error.status = 403;
  return error;
}

export async function getFacultyReadFilter(user) {
  if (!user?._id) {
    throw forbidden();
  }

  switch (user.role) {
    case 'system_admin':
    case 'directorate_staff':
      return { deletedAt: null };
    case 'faculty_member':
      return { user: user._id, deletedAt: null };
    case 'department_manager': {
      const profile = await Faculty.findOne({ user: user._id, deletedAt: null }).select('department').lean();

      if (typeof profile?.department !== 'string' || !profile.department.trim()) {
        throw forbidden('Department access is not configured');
      }

      return { department: profile.department, deletedAt: null };
    }
    default:
      throw forbidden();
  }
}
