import { fields, validateBody } from './record.validator.js';

const ranks = ['lecturer', 'senior_lecturer', 'associate_professor', 'professor'];
const draftFields = { requestedRank: fields.choice(ranks, true) };
export const createPromotionValidation = validateBody({ faculty: { ...fields.id, required: true }, ...draftFields });
export const updatePromotionValidation = validateBody(draftFields, true);
export const promotionWorkflowValidation = validateBody({
  status: fields.choice(['submitted', 'under_review', 'approved', 'rejected'], true),
  eligibilityStatus: fields.choice(['pending', 'eligible', 'ineligible']),
  eligibilityNotes: fields.text(3000), reviewNotes: fields.text(3000), effectiveDate: fields.date(),
});
