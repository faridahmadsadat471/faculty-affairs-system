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
    required: true,
    expires: 0,
  },
});

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);

export default RevokedToken;
