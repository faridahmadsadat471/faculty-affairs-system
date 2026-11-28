import bcrypt from 'bcryptjs';
import { matchedData } from 'express-validator';
import User from '../models/user.model.js';
import RevokedToken from '../models/revoked-token.model.js';
import { createAccessToken } from '../utils/jwt.js';
import { toPublicUser } from '../utils/user.js';

// This hash belongs to no account; it keeps missing-account password checks similar in cost.
const DUMMY_PASSWORD_HASH = '$2b$12$02WWVzbPD1MwBthCo5w2ROTUmbcbLC.Lzognmu9CoYCStiEolBl0W';

export async function registerUser(req, res, next) {
  try {
    const { fullName, email, password } = matchedData(req, { locations: ['body'] });

    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'faculty_member',
    });

    return res.status(201).json({
      message: 'User registered successfully',
      user: toPublicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const { email, password } = matchedData(req, { locations: ['body'] });
    const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || !user.isActive) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const accessToken = createAccessToken(user._id, user.tokenVersion || 0);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      message: 'Login successful',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: null,
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
}

export function getCurrentUser(req, res) {
  res.status(200).json({ user: toPublicUser(req.user) });
}

export async function logoutUser(req, res, next) {
  try {
    await RevokedToken.updateOne(
      { tokenHash: req.auth.tokenHash },
      { $setOnInsert: { expiresAt: req.auth.expiresAt } },
      { upsert: true },
    );
  } catch (error) {
    // A simultaneous logout may already have inserted the same token hash.
    if (error.code !== 11000) {
      return next(error);
    }
  }

  res.status(200).json({ message: 'Logout successful' });
}
