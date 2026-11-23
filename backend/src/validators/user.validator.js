import { checkExact, query } from 'express-validator';

export const listUsersValidation = checkExact(
  [
    query('page')
      .optional()
      .isString().withMessage('Page must be a single number').bail()
      .isInt({ min: 1, max: 1000000 }).withMessage('Page must be an integer from 1 to 1000000')
      .toInt(),
    query('limit')
      .optional()
      .isString().withMessage('Limit must be a single number').bail()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be an integer from 1 to 100')
      .toInt(),
  ],
  { locations: ['query'], message: 'Only page and limit query parameters are allowed' },
);
