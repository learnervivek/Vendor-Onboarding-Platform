import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/user.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const provisionSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['reviewer', 'admin']),
  temporaryPassword: z.string().min(16).max(128)
}).strict();

router.get('/', requireAuth, requireRole('admin'), async (_request, response, next) => {
  try {
    const users = await User.find().select('name email role status createdAt').sort({ createdAt: -1 }).limit(200);
    response.json({ data: { users } });
  } catch (error) { next(error); }
});

router.post('/', requireAuth, requireRole('admin'), async (request, response, next) => {
  try {
    const data = provisionSchema.parse(request.body);
    const user = await User.create({
      email: data.email.toLowerCase().trim(),
      name: data.name,
      role: data.role,
      passwordHash: await bcrypt.hash(data.temporaryPassword, 12),
      passwordChangedAt: new Date()
    });
    response.status(201).json({ data: { user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status } } });
  } catch (error) {
    if (error?.code === 11000) Object.assign(error, {
      statusCode: 409,
      code: 'USER_ALREADY_EXISTS',
      message: 'A user with this email already exists.'
    });
    next(error);
  }
});

export default router;
