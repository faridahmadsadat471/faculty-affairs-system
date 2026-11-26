import { fields, validateBody } from './record.validator.js';

export const contractFields = {
  contractNumber: fields.text(50, true), title: fields.text(200, true),
  startDate: fields.date(true), endDate: fields.date(true),
  renewalReminderDate: fields.date(), notes: fields.text(5000),
};
export const createContractValidation = validateBody({ faculty: { ...fields.id, required: true }, ...contractFields });
export const updateContractValidation = validateBody(contractFields, true);
export const renewContractValidation = validateBody(contractFields);
export const contractWorkflowValidation = validateBody({ status: fields.choice(['pending', 'approved', 'rejected'], true), reviewNotes: fields.text(3000) });
