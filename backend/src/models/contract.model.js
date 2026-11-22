import mongoose from 'mongoose';

const decisionStatuses = ['approved', 'rejected'];

const contractDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  storageKey: { type: String, required: true, trim: true, maxlength: 255 },
});

const contractSchema = new mongoose.Schema(
  {
    contractNumber: {
      type: String,
      required: [true, 'Contract number is required'],
      trim: true,
      uppercase: true,
      maxlength: 50,
      unique: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: [true, 'Faculty is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The user creating the contract is required'],
    },
    title: {
      type: String,
      required: [true, 'Contract title is required'],
      trim: true,
      maxlength: 200,
    },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return this.startDate != null && value >= this.startDate;
        },
        message: 'Contract end date must be on or after the start date',
      },
    },
    renewalReminderDate: {
      type: Date,
      validate: {
        validator(value) {
          return value == null || (this.endDate != null && value <= this.endDate);
        },
        message: 'Renewal reminder must be on or before the contract end date',
      },
    },
    approvalStatus: {
      type: String,
      required: true,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'draft',
    },
    submittedAt: {
      type: Date,
      required() {
        return this.approvalStatus !== 'draft';
      },
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return decisionStatuses.includes(this.approvalStatus);
      },
    },
    reviewedAt: {
      type: Date,
      required() {
        return decisionStatuses.includes(this.approvalStatus);
      },
      validate: {
        validator(value) {
          return value == null || (this.submittedAt != null && value >= this.submittedAt);
        },
        message: 'Review date must be on or after the submission date',
      },
    },
    reviewNotes: { type: String, trim: true, maxlength: 3000 },
    renewedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      validate: {
        validator(value) {
          return value == null || !value.equals(this._id);
        },
        message: 'A contract cannot be a renewal of itself',
      },
    },
    notes: { type: String, trim: true, maxlength: 5000 },
    documents: { type: [contractDocumentSchema], default: [] },
  },
  { timestamps: true },
);

contractSchema.index({ faculty: 1, startDate: -1 });
contractSchema.index({ approvalStatus: 1, endDate: 1 });

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
