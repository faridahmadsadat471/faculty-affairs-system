import mongoose from 'mongoose';
import { profileDocumentSchema } from './document-fields.js';

const educationSchema = new mongoose.Schema({
  degree: { type: String, required: true, trim: true, maxlength: 100 },
  institution: { type: String, required: true, trim: true, maxlength: 200 },
  fieldOfStudy: { type: String, trim: true, maxlength: 150 },
  graduationYear: {
    type: Number,
    min: 1900,
    validate: {
      validator: (year) => Number.isInteger(year) && year <= new Date().getUTCFullYear(),
      message: 'Graduation year must be a whole number no later than the current year',
    },
  },
});

const employmentHistorySchema = new mongoose.Schema({
  organization: { type: String, required: true, trim: true, maxlength: 200 },
  position: { type: String, required: true, trim: true, maxlength: 100 },
  startDate: { type: Date, required: true },
  endDate: {
    type: Date,
    validate: {
      validator(value) {
        return value == null || (this.startDate != null && value >= this.startDate);
      },
      message: 'Employment end date must be on or after the start date',
    },
  },
});

const facultySchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      trim: true,
      uppercase: true,
      maxlength: 50,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      maxlength: 150,
    },
    academicRank: {
      type: String,
      required: [true, 'Academic rank is required'],
      enum: ['lecturer', 'senior_lecturer', 'associate_professor', 'professor'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    phone: { type: String, trim: true, maxlength: 30 },
    employmentStatus: {
      type: String,
      required: true,
      enum: ['active', 'on_leave', 'retired', 'terminated'],
      default: 'active',
    },
    education: { type: [educationSchema], default: [] },
    employmentHistory: { type: [employmentHistorySchema], default: [] },
    deletedAt: { type: Date, default: null },
    documents: { type: [profileDocumentSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

facultySchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } },
);

const Faculty = mongoose.model('Faculty', facultySchema);

export default Faculty;
