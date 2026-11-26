import { body, checkExact, param, query } from 'express-validator';
import User from '../models/user.model.js';

const userFields = (partial = false) => {
  const rules = [
    body('fullName').isString().bail().trim().isLength({ min: 2, max: 100 }),
    body('email').isString().bail().trim().toLowerCase().isLength({ max: 254 }).bail().isEmail(),
    body('role').isString().bail().isIn(User.schema.path('role').enumValues),
  ];
  if (partial) rules.forEach((rule) => rule.optional());
  return [...rules, body('isActive').optional().custom((value) => typeof value === 'boolean').withMessage('isActive must be a JSON boolean')];
};
export function passwordField(name, minimum = 12) {
  return body(name).isString().bail().isLength({ min: minimum }).bail()
    .custom((value) => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password must contain at least 12 characters and at most 72 UTF-8 bytes');
}
export const userIdValidation = param('id').isMongoId().withMessage('Enter a valid user ID');
export const createUserValidation = checkExact([...userFields(), passwordField('password')], { locations: ['body'], message: 'Unsupported user field' });
export const updateUserValidation = [
  (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) return res.status(400).json({ message: 'Provide a nonempty user update' });
    next();
  },
  checkExact(userFields(true), { locations: ['body'], message: 'Only fullName, email, role, and isActive can be updated' }),
];
export const changePasswordValidation = checkExact([passwordField('currentPassword', 1), passwordField('newPassword')], { locations: ['body'], message: 'Only currentPassword and newPassword are allowed' });
export const resetPasswordValidation = checkExact([body('token').isString().bail().matches(/^[a-f\d]{64}$/), passwordField('newPassword')], { locations: ['body'], message: 'Only token and newPassword are allowed' });
export const resetIssueValidation = checkExact([], { locations: ['body', 'query'], message: 'Password reset issuance does not accept a body or query' });

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
