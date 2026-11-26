import mongoose from 'mongoose';
import { addRecordFields } from './record-fields.js';
import { addDocumentFields } from './document-fields.js';

const coAuthorSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  affiliation: { type: String, trim: true, maxlength: 200 },
});

const researchDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  storageKey: { type: String, required: true, trim: true, maxlength: 255 },
});
addDocumentFields(researchDocumentSchema);

const researchSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: [true, 'Faculty is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The user creating the research record is required'],
    },
    title: {
      type: String,
      required: [true, 'Research title is required'],
      trim: true,
      maxlength: 300,
    },
    researchType: {
      type: String,
      required: true,
      enum: ['research_paper', 'journal_article', 'book', 'conference_paper'],
    },
    abstract: { type: String, trim: true, maxlength: 10000 },
    coAuthors: { type: [coAuthorSchema], default: [] },
    publicationStatus: {
      type: String,
      required: true,
      enum: ['draft', 'submitted', 'accepted', 'published'],
      default: 'draft',
    },
    publicationDate: {
      type: Date,
      required() {
        return this.publicationStatus === 'published';
      },
    },
    publicationVenue: { type: String, trim: true, maxlength: 200 },
    doi: {
      type: String,
      trim: true,
      maxlength: 255,
      match: [/^10\.\d+\/\S+$/, 'Enter a DOI identifier such as 10.1234/example'],
    },
    publicationUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      validate: {
        validator(value) {
          if (!value) return true;

          try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol);
          } catch {
            return false;
          }
        },
        message: 'Publication URL must be an absolute HTTP or HTTPS address',
      },
    },
    keywords: {
      type: [{ type: String, required: true, trim: true, lowercase: true, maxlength: 100 }],
      default: [],
    },
    documents: { type: [researchDocumentSchema], default: [] },
  },
  { timestamps: true },
);

researchSchema.index({ faculty: 1, publicationDate: -1 });
addRecordFields(researchSchema);

const Research = mongoose.model('Research', researchSchema);

export default Research;
