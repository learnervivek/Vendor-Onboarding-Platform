import { newCsrfToken, tokenCookies } from '../auth/tokens.js';
import { env } from '../config/env.js';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function ensureCsrfCookie(request, response, next) {
  if (!request.cookies[tokenCookies.csrf]) {
    response.cookie(tokenCookies.csrf, newCsrfToken(), { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 1000, path: '/' });
  }
  next();
}

export function requireCsrf(request, _response, next) {
  if (!unsafeMethods.has(request.method)) return next();
  const origin = request.get('origin');
  if (origin && origin !== env.clientUrl) return next(Object.assign(new Error('Invalid request origin.'), { statusCode: 403, code: 'CSRF_FAILED' }));
  const cookie = request.cookies[tokenCookies.csrf];
  const header = request.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) return next(Object.assign(new Error('Invalid request token.'), { statusCode: 403, code: 'CSRF_FAILED' }));
  next();
}
