import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const tokenCookies = {
  access: 'edvexa_access',
  refresh: 'edvexa_refresh',
  csrf: 'edvexa_csrf'
};

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl });
}

export function signRefreshToken(user, familyId) {
  return jwt.sign({ sub: user.id, familyId, type: 'refresh' }, env.jwtRefreshSecret, { expiresIn: env.refreshTokenTtl });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newFamilyId() {
  return crypto.randomUUID();
}

export function newCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    signed: true,
    maxAge,
    path: '/'
  };
}

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
}
