import { Router } from 'express';
import { listUsers } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/role.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { listUsersValidation } from '../validators/user.validator.js';

const router = Router();

router.get('/', requireAuth, requireRoles('system_admin'), listUsersValidation, validateRequest, listUsers);

export default router;
