import { z } from 'zod';

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
}).strict().refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'from must be before or equal to to',
  path: ['from']
});

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseListQuery(query) {
  const normalized = Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== '')
  );
  return listQuerySchema.parse(normalized);
}
