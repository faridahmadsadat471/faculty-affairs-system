import User from '../models/user.model.js';

const knownRoles = User.schema.path('role').enumValues;

export function requireRoles(...roles) {
  if (roles.length === 0 || roles.some((role) => !knownRoles.includes(role))) {
    throw new TypeError('requireRoles needs at least one valid project role');
  }

  const allowedRoles = new Set(roles);

  return function authorizeRole(req, res, next) {
    res.set('Cache-Control', 'no-store');

    if (!req.user || req.user.isActive !== true) {
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
}
