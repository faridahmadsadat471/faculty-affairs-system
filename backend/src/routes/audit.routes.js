import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/role.middleware.js';
import { listAuditLogs } from '../controllers/audit.controller.js';
const router = Router();
router.get('/', requireAuth, requireRoles('system_admin'), listAuditLogs);
export default router;
