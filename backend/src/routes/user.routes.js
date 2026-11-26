import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, issuePasswordReset } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/role.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { listUsersValidation, userIdValidation, createUserValidation, updateUserValidation, resetIssueValidation } from '../validators/user.validator.js';
import { validateRecordQuery } from '../validators/record.validator.js';
import { auditMutations } from '../middleware/audit.middleware.js';
import { createRateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();

router.use(requireAuth, requireRoles('system_admin'), auditMutations('users'));
router.get('/', listUsersValidation, validateRequest, listUsers);
router.post('/', createRateLimit({ max: 30 }), validateRecordQuery, createUserValidation, validateRequest, createUser);
router.get('/:id', userIdValidation, validateRecordQuery, validateRequest, getUser);
router.patch('/:id', userIdValidation, validateRecordQuery, updateUserValidation, validateRequest, updateUser);
router.post('/:id/password-reset', createRateLimit({ max: 20 }), userIdValidation, resetIssueValidation, validateRequest, issuePasswordReset);

export default router;
