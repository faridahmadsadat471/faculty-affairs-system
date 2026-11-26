import { fields, validateBody } from './record.validator.js';
const awardFields = {
  title: fields.text(200, true), awardType: fields.choice(['award', 'achievement'], true),
  awardingOrganization: fields.text(200), dateReceived: fields.date(true),
  description: fields.text(5000), referenceNumber: fields.text(100),
};
export const createAwardValidation = validateBody({ faculty: { ...fields.id, required: true }, ...awardFields });
export const updateAwardValidation = validateBody(awardFields, true);
