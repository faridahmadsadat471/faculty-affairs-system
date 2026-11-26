export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function recordError(error, res, next) {
  if (error.code === 11000) return res.status(409).json({ message: 'This identifier already exists' });
  if (error.name === 'VersionError') return res.status(409).json({ message: 'Record changed. Reload and try again' });
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Validation failed', errors: Object.keys(error.errors).map((field) => ({ field, message: 'Invalid or missing field value' })) });
  }
  return next(error);
}
