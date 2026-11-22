import mongoose from 'mongoose';

const awardDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  storageKey: { type: String, required: true, trim: true, maxlength: 255 },
});

const awardSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: [true, 'Faculty is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The user creating the award record is required'],
    },
    title: {
      type: String,
      required: [true, 'Award or achievement title is required'],
      trim: true,
      maxlength: 200,
    },
    awardType: {
      type: String,
      required: true,
      enum: ['award', 'achievement'],
    },
    awardingOrganization: {
      type: String,
      trim: true,
      maxlength: 200,
      required() {
        return this.awardType === 'award';
      },
    },
    dateReceived: {
      type: Date,
      required: [true, 'Date received is required'],
    },
    description: { type: String, trim: true, maxlength: 5000 },
    referenceNumber: { type: String, trim: true, maxlength: 100 },
    documents: { type: [awardDocumentSchema], default: [] },
  },
  { timestamps: true },
);

awardSchema.index({ faculty: 1, dateReceived: -1 });

const Award = mongoose.model('Award', awardSchema);

export default Award;
