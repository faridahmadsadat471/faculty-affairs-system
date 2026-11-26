import { Router } from 'express';
import { auditMutations } from '../middleware/audit.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateRecordQuery } from '../validators/record.validator.js';
import { createContractValidation, updateContractValidation, renewContractValidation, contractWorkflowValidation } from '../validators/contract.validator.js';
import { contracts, contractWorkflow, renewContract } from '../controllers/contract.controller.js';

const router = Router();
router.use(requireAuth);
router.use(auditMutations('contracts'));
router.get('/', validateRecordQuery, contracts.list);
router.post('/', validateRecordQuery, createContractValidation, contracts.create);
router.get('/:id', validateRecordQuery, contracts.get);
router.patch('/:id', validateRecordQuery, updateContractValidation, contracts.update);
router.patch('/:id/status', validateRecordQuery, contractWorkflowValidation, contractWorkflow);
router.post('/:id/renew', validateRecordQuery, renewContractValidation, renewContract);
router.delete('/:id', validateRecordQuery, contracts.archive);
export default router;
