import { httpError } from '../utils/http-error.js';

const idPattern = /^[a-f\d]{24}$/i;
export const fields = {
  id: { type: 'id' },
  text: (max, required = false) => ({ type: 'text', max, required }),
  choice: (values, required = false) => ({ type: 'choice', values, required }),
  date: (required = false) => ({ type: 'date', required }),
  list: (items, max = 50) => ({ type: 'list', items, max }),
  object: (shape) => ({ type: 'object', shape }),
};

function valueFor(value, rule, name) {
  const invalid = () => { throw httpError(400, `Invalid ${name}`); };
  if (rule.type === 'text') {
    if (typeof value !== 'string' || value.trim().length > rule.max || (rule.required && !value.trim())) invalid();
    return value.trim();
  }
  if (rule.type === 'id') {
    if (typeof value !== 'string' || !idPattern.test(value)) invalid();
    return value;
  }
  if (rule.type === 'choice') {
    if (typeof value !== 'string' || !rule.values.includes(value)) invalid();
    return value;
  }
  if (rule.type === 'date') {
    // Use date-only ISO values to avoid ambiguous local date parsing and rollover.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid();
    return value;
  }
  if (rule.type === 'list') {
    if (!Array.isArray(value) || value.length > rule.max) invalid();
    return value.map((item) => valueFor(item, rule.items, name));
  }
  if (rule.type === 'object') return cleanBody(value, rule.shape, false);
  invalid();
}

export function cleanBody(body, shape, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) throw httpError(400, 'Provide a nonempty JSON object');
  for (const name of Object.keys(body)) if (!Object.hasOwn(shape, name)) throw httpError(400, `Unsupported field: ${name}`);
  const result = {};
  for (const [name, rule] of Object.entries(shape)) {
    if (Object.hasOwn(body, name)) result[name] = valueFor(body[name], rule, name);
    else if (rule.required && !partial) throw httpError(400, `${name} is required`);
  }
  return result;
}

export function validateBody(shape, partial = false) {
  return (req, res, next) => {
    try { req.input = cleanBody(req.body, shape, partial); next(); } catch (error) { next(error); }
  };
}

export function validateRecordQuery(req, res, next) {
  try {
    if (req.params.id && !idPattern.test(req.params.id)) throw httpError(400, 'Enter a valid record ID');
    const allowed = req.params.id || req.method !== 'GET' ? [] : ['page', 'limit', 'search', 'faculty', 'status'];
    if (Object.keys(req.query).some((key) => !allowed.includes(key))) throw httpError(400, 'Unsupported query parameter');
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value !== 'string' || !value || value.length > 100) throw httpError(400, 'Invalid query parameter');
      if (['page', 'limit'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (key === 'limit' ? 100 : 1000000))) throw httpError(400, 'Invalid pagination');
      if (key === 'faculty' && !idPattern.test(value)) throw httpError(400, 'Invalid faculty ID');
    }
    next();
  } catch (error) { next(error); }
}
