import { Router } from 'express';
import { getCurrentUser, loginUser, logoutUser, registerUser } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { loginValidation, registerValidation } from '../validators/auth.validator.js';
import { createRateLimit } from '../middleware/rate-limit.middleware.js';
import { auditMutations } from '../middleware/audit.middleware.js';
import { changePassword, resetPassword } from '../controllers/password.controller.js';
import { changePasswordValidation, resetPasswordValidation } from '../validators/user.validator.js';

const router = Router();
const authLimit = createRateLimit();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.post('/register', authLimit, auditMutations('auth'), registerValidation, validateRequest, registerUser);
router.post('/login', authLimit, auditMutations('auth'), loginValidation, validateRequest, loginUser);
router.get('/me', requireAuth, getCurrentUser);
router.post('/logout', requireAuth, auditMutations('auth'), logoutUser);
router.post('/change-password', authLimit, requireAuth, auditMutations('auth'), changePasswordValidation, validateRequest, changePassword);
router.post('/reset-password', authLimit, auditMutations('auth'), resetPasswordValidation, validateRequest, resetPassword);

export default router;
