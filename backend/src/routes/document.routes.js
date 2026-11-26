import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createRateLimit } from '../middleware/rate-limit.middleware.js';
import { documentAccess, uploadDocument, downloadDocument } from '../controllers/document.controller.js';
import { httpError } from '../utils/http-error.js';
import { auditMutations } from '../middleware/audit.middleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 1000, fieldNameSize: 50, fieldNestingDepth: 0 },
  fileFilter(req, file, done) {
    done(file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname) ? null : httpError(400, 'Only PDF documents are supported'), true);
  },
});
const router = Router();
function parseUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error && !(error instanceof multer.MulterError) && !error.status) return next(httpError(400, 'Invalid multipart upload'));
    next(error);
  });
}
router.use(requireAuth);
router.use(auditMutations('documents'));
router.post('/:module/:recordId', createRateLimit({ max: 30 }), documentAccess, parseUpload, uploadDocument);
router.get('/:module/:recordId/:documentId', documentAccess, downloadDocument);
export default router;
