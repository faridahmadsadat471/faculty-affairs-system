import { body, checkExact, param, query } from 'express-validator';
import Faculty from '../models/faculty.model.js';

export const getFacultyValidation = [
  param('id').isMongoId().withMessage('Enter a valid faculty ID'),
  checkExact([], { locations: ['query'], message: 'Query parameters are not supported for this endpoint' }),
];

export const listFacultyValidation = checkExact(
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

function textField(name, min, max) {
  return body(name)
    .isString().withMessage(`${name} must be text`).bail()
    .trim()
    .custom((value) => value.length >= min && value.length <= max)
    .withMessage(`${name} must contain ${min} to ${max} characters`);
}

function onlyFields(items, fields) {
  return items.every((item) => (
    item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && Object.keys(item).every((key) => fields.includes(key))
  ));
}

function facultyFieldValidation(partial = false) {
  const requiredFields = [
    textField('employeeId', 1, 50).toUpperCase(),
    textField('fullName', 2, 100),
    textField('department', 1, 150),
    body('academicRank')
      .isString().withMessage('Academic rank must be text').bail()
      .isIn(Faculty.schema.path('academicRank').enumValues)
      .withMessage('Choose a supported academic rank'),
  ];

  if (partial) requiredFields.forEach((field) => field.optional());

  return [
    ...requiredFields,
    body('user')
      .optional()
      .custom((value) => value === null || (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)))
      .withMessage('User must be a valid user ID or null'),
    body('email')
      .optional()
      .isString().withMessage('Email must be text').bail()
      .trim().toLowerCase()
      .custom((value) => value.length <= 254)
      .withMessage('Email must not exceed 254 characters').bail()
      .isEmail().withMessage('Enter a valid email address'),
    textField('phone', 0, 30).optional(),
    body('employmentStatus')
      .optional()
      .isString().withMessage('Employment status must be text').bail()
      .isIn(Faculty.schema.path('employmentStatus').enumValues)
      .withMessage('Choose a supported employment status'),
    body('education')
      .optional()
      .isArray({ max: 50 }).withMessage('Education must be an array with at most 50 entries').bail()
      .custom((items) => onlyFields(items, ['degree', 'institution', 'fieldOfStudy', 'graduationYear']))
      .withMessage('Education entries may contain only degree, institution, fieldOfStudy, and graduationYear'),
    body('employmentHistory')
      .optional()
      .isArray({ max: 50 }).withMessage('Employment history must be an array with at most 50 entries').bail()
      .custom((items) => onlyFields(items, ['organization', 'position', 'startDate', 'endDate']))
      .withMessage('Employment entries may contain only organization, position, startDate, and endDate'),
  ];
}

export const createFacultyValidation = checkExact(
  facultyFieldValidation(),
  {
    locations: ['body'],
    message: 'Only supported faculty profile fields are allowed',
  },
);

export const updateFacultyValidation = [
  ...getFacultyValidation,
  function requireUpdateBody(req, res, next) {
    const value = req.body;
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: [{ field: 'body', message: 'Provide at least one faculty field to update' }],
      });
    }
    next();
  },
  checkExact(facultyFieldValidation(true), {
    locations: ['body'],
    message: 'Only supported faculty profile fields are allowed',
  }),
];
