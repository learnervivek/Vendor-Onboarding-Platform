import bcrypt from 'bcryptjs';
import { User } from '../models/user.js';
import { RefreshToken } from '../models/refresh-token.js';
import { hashToken, newFamilyId, publicUser, signAccessToken, signRefreshToken } from './tokens.js';
import { env } from '../config/env.js';

const SALT_ROUNDS = 12;

export async function registerVendor({ email, password, name }) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.exists({ email: normalizedEmail });
  if (existing) {
    const error = new Error('Unable to create account.');
    error.statusCode = 409;
    error.code = 'REGISTRATION_UNAVAILABLE';
    throw error;
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ email: normalizedEmail, passwordHash, name, role: 'vendor', passwordChangedAt: new Date() });
  return publicUser(user);
}

export async function authenticate(email, password) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.passwordHash))) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }
  return user;
}

export async function issueSession(user, familyId = newFamilyId()) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, familyId);
  const decoded = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString());
  await RefreshToken.create({ userId: user.id, tokenHash: hashToken(refreshToken), familyId, expiresAt: new Date(decoded.exp * 1000) });
  return { accessToken, refreshToken, user: publicUser(user) };
}

export async function rotateSession(refreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw Object.assign(new Error('Invalid session.'), { statusCode: 401, code: 'INVALID_SESSION' });
  }
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    if (decoded.familyId) await RefreshToken.updateMany({ familyId: decoded.familyId, revokedAt: null }, { revokedAt: new Date() });
    const error = new Error('Invalid session.');
    error.statusCode = 401;
    error.code = 'INVALID_SESSION';
    throw error;
  }
  const user = await User.findById(decoded.sub);
  if (!user || user.status !== 'active') throw Object.assign(new Error('Invalid session.'), { statusCode: 401, code: 'INVALID_SESSION' });
  stored.revokedAt = new Date();
  await stored.save();
  return issueSession(user, decoded.familyId);
}

export async function revokeSession(refreshToken) {
  if (!refreshToken) return;
  try {
    const decoded = verifyRefreshToken(refreshToken);
    await RefreshToken.updateMany({ familyId: decoded.familyId, revokedAt: null }, { revokedAt: new Date() });
  } catch {
    // Logout is intentionally idempotent.
  }
}

export async function updateProfile(userId, updates) {
  const user = await User.findByIdAndUpdate(userId, { $set: { name: updates.name } }, { new: true, runValidators: true });
  return publicUser(user);
}
