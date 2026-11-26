export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large' });
  if (err.name === 'MulterError') return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'PDF must not exceed 2 MB' : 'Invalid multipart upload' });

  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message,
  });
}
