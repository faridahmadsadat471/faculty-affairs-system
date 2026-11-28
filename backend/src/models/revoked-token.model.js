import mongoose from 'mongoose';

const revokedTokenSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    match: /^[a-f0-9]{64}$/,
  },
  expiresAt: {
    type: Date,
    // MongoDB TTL ignores null: revocations for sessions without an expiry must remain.
    default: null,
    expires: 0,
  },
});

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);

export default RevokedToken;
