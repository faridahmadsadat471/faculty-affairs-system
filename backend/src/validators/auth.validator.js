import { body, checkExact } from 'express-validator';

function emailValidation() {
  return body('email')
    .isString().withMessage('Email must be text').bail()
    .trim().toLowerCase()
    .custom((value) => value.length <= 254)
    .withMessage('Email must not exceed 254 characters').bail()
    .isEmail().withMessage('Enter a valid email address');
}

export const registerValidation = checkExact(
  [
    body('fullName')
      .isString().withMessage('Full name must be text').bail()
      .trim()
      .custom((value) => value.length >= 2 && value.length <= 100)
      .withMessage('Full name must contain 2 to 100 characters'),
    emailValidation(),
    body('password')
      .isString().withMessage('Password must be text').bail()
      .notEmpty({ ignore_whitespace: true }).withMessage('Password is required').bail()
      .isLength({ min: 12 }).withMessage('Password must contain at least 12 characters').bail()
      .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
      .withMessage('Password must not exceed 72 UTF-8 bytes'),
  ],
  {
    locations: ['body'],
    message: 'Only fullName, email, and password are allowed',
  },
);

export const loginValidation = checkExact(
  [
    emailValidation(),
    body('password')
      .isString().withMessage('Password must be text').bail()
      .notEmpty({ ignore_whitespace: true }).withMessage('Password is required').bail()
      .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
      .withMessage('Password must not exceed 72 UTF-8 bytes'),
  ],
  {
    locations: ['body'],
    message: 'Only email and password are allowed',
  },
);
