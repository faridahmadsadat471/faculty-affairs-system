import mongoose from 'mongoose';
import { addRecordFields } from './record-fields.js';
import { addDocumentFields } from './document-fields.js';

const academicRanks = ['lecturer', 'senior_lecturer', 'associate_professor', 'professor'];
const decisionStatuses = ['approved', 'rejected'];

const supportingDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  storageKey: { type: String, required: true, trim: true, maxlength: 255 },
});
addDocumentFields(supportingDocumentSchema);

const promotionSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: [true, 'Faculty is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The user creating the request is required'],
    },
    currentRank: {
      type: String,
      required: true,
      enum: academicRanks,
    },
    requestedRank: {
      type: String,
      required: true,
      enum: academicRanks,
      validate: {
        validator(rank) {
          return academicRanks.indexOf(rank) > academicRanks.indexOf(this.currentRank);
        },
        message: 'Requested rank must be higher than the current rank',
      },
    },
    eligibilityStatus: {
      type: String,
      required: true,
      enum: ['pending', 'eligible', 'ineligible'],
      default: 'pending',
      validate: {
        validator(value) {
          return this.status !== 'approved' || value === 'eligible';
        },
        message: 'An approved promotion must have an eligible assessment',
      },
    },
    eligibilityNotes: { type: String, trim: true, maxlength: 3000 },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected'],
      default: 'draft',
    },
    submittedAt: {
      type: Date,
      required() {
        return this.status !== 'draft';
      },
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return decisionStatuses.includes(this.status);
      },
    },
    reviewedAt: {
      type: Date,
      required() {
        return decisionStatuses.includes(this.status);
      },
      validate: {
        validator(value) {
          return value == null || (this.submittedAt != null && value >= this.submittedAt);
        },
        message: 'Review date must be on or after the submission date',
      },
    },
    reviewNotes: { type: String, trim: true, maxlength: 3000 },
    effectiveDate: {
      type: Date,
      required() {
        return this.status === 'approved';
      },
    },
    supportingDocuments: { type: [supportingDocumentSchema], default: [] },
  },
  { timestamps: true },
);

promotionSchema.index({ faculty: 1, createdAt: -1 });
addRecordFields(promotionSchema);

const Promotion = mongoose.model('Promotion', promotionSchema);

export default Promotion;
