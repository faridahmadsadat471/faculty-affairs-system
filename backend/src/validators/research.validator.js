import { fields, validateBody } from './record.validator.js';

const researchFields = {
  title: fields.text(300, true),
  researchType: fields.choice(['research_paper', 'journal_article', 'book', 'conference_paper'], true),
  abstract: fields.text(10000),
  coAuthors: fields.list(fields.object({ fullName: fields.text(100, true), affiliation: fields.text(200) })),
  publicationVenue: fields.text(200), doi: fields.text(255), publicationUrl: fields.text(2048),
  keywords: fields.list(fields.text(100, true), 30),
};
export const createResearchValidation = validateBody({ faculty: { ...fields.id, required: true }, ...researchFields });
export const updateResearchValidation = validateBody(researchFields, true);
export const researchWorkflowValidation = validateBody({ status: fields.choice(['submitted', 'accepted', 'published'], true), publicationDate: fields.date() });
