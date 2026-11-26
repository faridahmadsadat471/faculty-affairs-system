import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import RevokedToken from '../models/revoked-token.model.js';
import { hashAccessToken, verifyAccessToken } from '../utils/jwt.js';

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json({ message: 'Authentication required' });
}

export async function requireAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');

  const authorization = req.get('Authorization');
  const bearer = authorization?.match(/^Bearer[ \t]+(\S+)$/i);

  if (!bearer) {
    return unauthorized(res);
  }

  try {
    const payload = verifyAccessToken(bearer[1]);
    const tokenHash = hashAccessToken(bearer[1]);

    if (await RevokedToken.exists({ tokenHash })) {
      return unauthorized(res);
    }

    const user = await User.findById(payload.sub)
      .select('_id fullName email role isActive createdAt +tokenVersion');

    if (!user || !user.isActive || (payload.v || 0) !== (user.tokenVersion || 0)) {
      return unauthorized(res);
    }

    req.user = user;
    req.auth = { tokenHash, expiresAt: new Date(payload.exp * 1000) };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return unauthorized(res);
    }

    next(error);
  }
}
