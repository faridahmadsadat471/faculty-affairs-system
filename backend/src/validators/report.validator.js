import { httpError } from '../utils/http-error.js';
export function reportQuery(req, res, next) {
  try {
    const allowed = req.path.endsWith('/expiring') ? ['days', 'page', 'limit'] : ['from', 'to'];
    for (const [name, value] of Object.entries(req.query)) {
      if (!allowed.includes(name) || typeof value !== 'string') throw httpError(400, 'Unsupported report parameter');
      if (['from', 'to'].includes(name)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw httpError(400, 'Use valid YYYY-MM-DD report dates');
      } else if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > ({ days: 365, page: 1000000, limit: 100 })[name]) throw httpError(400, 'Invalid report pagination or days');
    }
    if (req.query.from && req.query.to && req.query.from > req.query.to) throw httpError(400, 'Report start date must precede end date');
    next();
  } catch (error) { next(error); }
}
