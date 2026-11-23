import { validationResult } from 'express-validator';

export function validateRequest(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: result.array({ onlyFirstError: true }).map((error) => ({
        field: error.path || error.fields?.[0]?.location || 'request',
        message: error.msg,
      })),
    });
  }

  next();
}
