import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  requestId: { type: String, required: true, immutable: true, unique: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resource: { type: String, required: true, immutable: true },
  resourceId: mongoose.Schema.Types.ObjectId,
  action: { type: String, required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  completedAt: Date,
  outcome: { type: String, enum: ['started', 'succeeded', 'rejected', 'uncertain'], default: 'started' },
  statusCode: Number,
  fields: [String],
  changes: [{ _id: false, field: String, before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed }],
}, { versionKey: false });
auditLogSchema.index({ occurredAt: -1, _id: -1 });
auditLogSchema.index({ actor: 1, occurredAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, occurredAt: -1 });
export default mongoose.model('AuditLog', auditLogSchema);
