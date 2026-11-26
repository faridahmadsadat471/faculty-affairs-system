import { Router } from 'express';
import { auditMutations } from '../middleware/audit.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateRecordQuery } from '../validators/record.validator.js';
import { createPromotionValidation, updatePromotionValidation, promotionWorkflowValidation } from '../validators/promotion.validator.js';
import { promotions, promotionWorkflow } from '../controllers/promotion.controller.js';

const router = Router();
router.use(requireAuth);
router.use(auditMutations('promotions'));
router.get('/', validateRecordQuery, promotions.list);
router.post('/', validateRecordQuery, createPromotionValidation, promotions.create);
router.get('/:id', validateRecordQuery, promotions.get);
router.patch('/:id', validateRecordQuery, updatePromotionValidation, promotions.update);
router.patch('/:id/status', validateRecordQuery, promotionWorkflowValidation, promotionWorkflow);
router.delete('/:id', validateRecordQuery, promotions.archive);
export default router;
