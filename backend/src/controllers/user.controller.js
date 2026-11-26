import { matchedData } from 'express-validator';
import User from '../models/user.model.js';
import { toPublicUser } from '../utils/user.js';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { protectLastAdministrator, withAccountMutation } from '../services/user-management.service.js';
import { recordError, httpError } from '../utils/http-error.js';
import { trackChanges } from '../middleware/audit.middleware.js';

export async function listUsers(req, res, next) {
  try {
    const { page = 1, limit = 20 } = matchedData(req, { locations: ['query'] });
    const [users, total] = await Promise.all([
      User.find()
        .select('_id fullName email role isActive createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    res.status(200).json({
      users: users.map(toPublicUser),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: toPublicUser(user) });
  } catch (error) { next(error); }
}

export async function createUser(req, res, next) {
  try {
    const { password, ...input } = matchedData(req, { locations: ['body'] });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await withAccountMutation(req.user, () => User.create({ ...input, passwordHash }));
    return res.status(201).json({ message: 'User created successfully', user: toPublicUser(user) });
  } catch (error) { recordError(error, res, next); }
}

export async function updateUser(req, res, next) {
  try {
    const input = matchedData(req, { locations: ['body'] });
    const updated = await withAccountMutation(req.user, async () => {
      const user = await User.findById(req.params.id);
      if (!user) throw httpError(404, 'User not found');
      await protectLastAdministrator(user, input);
      const before = user.toObject();
      const securityChanged = (input.role !== undefined && input.role !== user.role) || (input.isActive !== undefined && input.isActive !== user.isActive) || (input.email !== undefined && input.email !== user.email);
      trackChanges(req, before, { ...before, ...input }, ['role', 'isActive']);
      return User.findOneAndUpdate({ _id: user._id }, {
        $set: input,
        ...(securityChanged ? { $inc: { tokenVersion: 1 }, $unset: { passwordResetHash: '', passwordResetExpiresAt: '', passwordResetVersion: '' } } : {}),
      }, { returnDocument: 'after', runValidators: true });
    });
    return res.json({ message: 'User updated successfully', user: toPublicUser(updated) });
  } catch (error) { recordError(error, res, next); }
}

export async function issuePasswordReset(req, res, next) {
  try {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await withAccountMutation(req.user, async () => {
      const target = await User.findById(req.params.id).select('isActive +tokenVersion');
      if (!target) throw httpError(404, 'User not found');
      if (!target.isActive) throw httpError(409, 'Activate the account before issuing password recovery');
      await User.updateOne({ _id: target._id }, { $set: { passwordResetHash: createHash('sha256').update(token).digest('hex'), passwordResetExpiresAt: expiresAt, passwordResetVersion: target.tokenVersion || 0 } });
    });
    return res.json({ message: 'Give this one-use token only to the verified account owner using an approved private channel', resetToken: token, expiresAt });
  } catch (error) { recordError(error, res, next); }
}
