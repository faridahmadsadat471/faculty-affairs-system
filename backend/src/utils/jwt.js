import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';

export const ACCESS_TOKEN_EXPIRES_IN = 15 * 60;
export const JWT_ISSUER = 'faculty-affairs-api';
export const JWT_AUDIENCE = 'faculty-affairs-client';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== 'string'
    || secret.trim().length < 32
    || secret === 'replace_with_a_long_random_secret_before_implementing_login'
  ) {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in backend/.env');
  }

  return secret;
}

export function createAccessToken(userId, tokenVersion = 0) {
  return jwt.sign({ v: tokenVersion }, getJwtSecret(), {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: randomUUID(),
  });
}

export function hashAccessToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    maxAge: ACCESS_TOKEN_EXPIRES_IN,
  });

  if (
    !payload
    || typeof payload !== 'object'
    || typeof payload.sub !== 'string'
    || !/^[a-f\d]{24}$/i.test(payload.sub)
    || !Number.isInteger(payload.iat)
    || !Number.isInteger(payload.exp)
    || payload.exp <= payload.iat
    || payload.exp - payload.iat > ACCESS_TOKEN_EXPIRES_IN
    || payload.iat > Math.floor(Date.now() / 1000)
    || (payload.v !== undefined && (!Number.isSafeInteger(payload.v) || payload.v < 0))
  ) {
    throw new jwt.JsonWebTokenError('Invalid access token claims');
  }

  return payload;
}
