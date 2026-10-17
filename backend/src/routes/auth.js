import { Router } from 'express';
import { z } from 'zod';
import { authenticate, issueSession, registerVendor, revokeSession, rotateSession, updateProfile } from '../auth/service.js';
import { cookieOptions, tokenCookies } from '../auth/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128) });
const registration = credentials.extend({ name: z.string().trim().min(2).max(120) });
const profile = z.object({ name: z.string().trim().min(2).max(120) }).strict();
const accessMaxAge = 15 * 60 * 1000;
const refreshMaxAge = 7 * 24 * 60 * 60 * 1000;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts.' } }
});

function setSessionCookies(response, session) {
  response.cookie(tokenCookies.access, session.accessToken, cookieOptions(accessMaxAge));
  response.cookie(tokenCookies.refresh, session.refreshToken, cookieOptions(refreshMaxAge));
}

router.post('/register', authLimiter, async (request, response, next) => {
  try {
    const data = registration.parse(request.body);
    const user = await registerVendor(data);
    const session = await issueSession({ ...user, id: user.id });
    setSessionCookies(response, session);
    response.status(201).json({ data: { user } });
  } catch (error) { next(error); }
});

router.post('/login', authLimiter, async (request, response, next) => {
  try {
    const data = credentials.parse(request.body);
    const user = await authenticate(data.email, data.password);
    const session = await issueSession(user);
    setSessionCookies(response, session);
    response.json({ data: { user: session.user } });
  } catch (error) { next(error); }
});

router.post('/refresh', authLimiter, async (request, response, next) => {
  try {
    const token = request.signedCookies[tokenCookies.refresh];
    if (!token) throw Object.assign(new Error('Invalid session.'), { statusCode: 401, code: 'INVALID_SESSION' });
    const session = await rotateSession(token);
    setSessionCookies(response, session);
    response.json({ data: { user: session.user } });
  } catch (error) { next(error); }
});

router.post('/logout', async (request, response) => {
  await revokeSession(request.signedCookies[tokenCookies.refresh]);
  for (const name of Object.values(tokenCookies)) response.clearCookie(name, { path: '/', httpOnly: name !== tokenCookies.csrf });
  response.status(204).end();
});

router.get('/me', requireAuth, (request, response) => response.json({ data: { user: request.user } }));

router.patch('/me', requireAuth, async (request, response, next) => {
  try {
    const data = profile.parse(request.body);
    const user = await updateProfile(request.user.id, data);
    response.json({ data: { user } });
  } catch (error) { next(error); }
});

export default router;
