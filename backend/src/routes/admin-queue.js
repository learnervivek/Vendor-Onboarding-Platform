import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { OutboxEvent } from '../models/outbox-event.js';
import { Notification } from '../models/notification.js';
import { publishPendingEvents, recoverFailedEvents } from '../services/outbox.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/health', async (_request, response, next) => {
  try {
    const [pending, failed, notifications] = await Promise.all([
      OutboxEvent.countDocuments({ status: { $in: ['pending', 'published', 'processing'] } }),
      OutboxEvent.countDocuments({ status: 'failed' }),
      Notification.countDocuments({ status: 'failed' })
    ]);
    response.json({ data: { adapter: process.env.QUEUE_ADAPTER ?? 'redis', pending, failed, failedNotifications: notifications } });
  } catch (error) { next(error); }
});

router.post('/recover-failed', async (_request, response, next) => {
  try {
    const result = await recoverFailedEvents();
    const published = await publishPendingEvents();
    response.json({ data: { recovered: result.modifiedCount, published } });
  } catch (error) { next(error); }
});

router.get('/events', async (_request, response, next) => {
  try { response.json({ data: { events: await OutboxEvent.find().select('-payload').sort({ createdAt: -1 }).limit(100) } }); } catch (error) { next(error); }
});

router.get('/notifications', async (_request, response, next) => {
  try { response.json({ data: { notifications: await Notification.find().sort({ createdAt: -1 }).limit(100) } }); } catch (error) { next(error); }
});

export default router;
