import mongoose from 'mongoose';

export function addRecordFields(schema) {
  schema.add({
    deletedAt: { type: Date, default: null },
    history: { type: [{ action: { type: String, required: true }, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, at: { type: Date, required: true }, from: String, to: String }], default: [] },
  });
  schema.set('optimisticConcurrency', true);
  schema.index({ deletedAt: 1, faculty: 1, createdAt: -1 });
}
