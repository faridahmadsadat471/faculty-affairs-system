import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import facultyRoutes from './routes/faculty.routes.js';
import promotionRoutes from './routes/promotion.routes.js';
import contractRoutes from './routes/contract.routes.js';
import researchRoutes from './routes/research.routes.js';
import awardRoutes from './routes/award.routes.js';
import reportRoutes from './routes/report.routes.js';
import documentRoutes from './routes/document.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { httpError } from './utils/http-error.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';

const app = express();

app.use(helmet());
app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(cors({ origin(origin, callback) {
  const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim());
  callback(!origin || allowed.includes(origin) ? null : httpError(403, 'Origin is not allowed'), true);
} }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/awards', awardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit-logs', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
