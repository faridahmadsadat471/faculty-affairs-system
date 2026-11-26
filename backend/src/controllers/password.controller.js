import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { matchedData } from 'express-validator';
import User from '../models/user.model.js';
import { httpError, recordError } from '../utils/http-error.js';

const resetFields = { passwordResetHash: '', passwordResetExpiresAt: '', passwordResetVersion: '' };
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = matchedData(req, { locations: ['body'] });
    const user = await User.findById(req.user._id).select('+passwordHash +tokenVersion');
    if (!user?.isActive || (user.tokenVersion || 0) !== (req.user.tokenVersion || 0) || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw httpError(401, 'Current credentials are invalid');
    if (await bcrypt.compare(newPassword, user.passwordHash)) throw httpError(400, 'Choose a different new password');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await User.updateOne({ _id: user._id, passwordHash: user.passwordHash, $or: [{ tokenVersion: user.tokenVersion || 0 }, ...(user.tokenVersion ? [] : [{ tokenVersion: { $exists: false } }])] }, { $set: { passwordHash }, $inc: { tokenVersion: 1 }, $unset: resetFields });
    if (!updated.modifiedCount) throw httpError(409, 'Account changed. Log in again before retrying');
    return res.json({ message: 'Password changed. All sessions were ended; log in again' });
  } catch (error) { recordError(error, res, next); }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = matchedData(req, { locations: ['body'] });
    const passwordResetHash = createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ passwordResetHash, passwordResetExpiresAt: { $gt: new Date() }, isActive: true }).select('+passwordHash +tokenVersion +passwordResetVersion');
    if (!user || (user.tokenVersion || 0) !== user.passwordResetVersion) throw httpError(400, 'Recovery token is invalid or expired');
    if (await bcrypt.compare(newPassword, user.passwordHash)) throw httpError(400, 'Choose a different new password');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await User.updateOne({ _id: user._id, passwordResetHash, passwordResetExpiresAt: { $gt: new Date() }, isActive: true, $or: [{ tokenVersion: user.passwordResetVersion }, ...(user.passwordResetVersion === 0 ? [{ tokenVersion: { $exists: false } }] : [])] }, { $set: { passwordHash }, $inc: { tokenVersion: 1 }, $unset: resetFields });
    if (!updated.modifiedCount) throw httpError(400, 'Recovery token is invalid or expired');
    req.user = { _id: user._id };
    return res.json({ message: 'Password reset. All sessions were ended; log in again' });
  } catch (error) { recordError(error, res, next); }
}
