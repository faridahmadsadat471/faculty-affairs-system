import mongoose from 'mongoose';
export function addDocumentFields(schema) {
  schema.add({
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date, size: Number, sha256: String,
  });
}
export const profileDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  storageKey: { type: String, required: true },
});
addDocumentFields(profileDocumentSchema);
