import { User } from '../models/user.js';
import { verifyAccessToken } from '../auth/tokens.js';

export async function requireAuth(request, _response, next) {
  try {
    const token = request.signedCookies.edvexa_access;
    if (!token) return next(Object.assign(new Error('Authentication required.'), { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }));
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') throw new Error('Invalid token.');
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') throw new Error('Invalid token.');
    request.user = user;
    return next();
  } catch {
    return next(Object.assign(new Error('Authentication required.'), { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }));
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user) return next(Object.assign(new Error('Authentication required.'), { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }));
    if (!roles.includes(request.user.role)) return next(Object.assign(new Error('You do not have permission to perform this action.'), { statusCode: 403, code: 'FORBIDDEN' }));
    return next();
  };
}
