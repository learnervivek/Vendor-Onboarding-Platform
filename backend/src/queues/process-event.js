import { OutboxEvent } from '../models/outbox-event.js';
import { processNotification } from '../notifications/service.js';
import { processDocumentEvent } from './process-document.js';

export async function processEvent(eventId) {
  const eventType = await OutboxEvent.findOne({ eventId }).select('type');
  if (eventType?.type === 'document.uploaded') return processDocumentEvent(eventId);
  const event = await OutboxEvent.findOneAndUpdate({ eventId, status: { $in: ['published', 'processing'] } }, { $set: { status: 'processing' }, $inc: { attempts: 1 } }, { new: true });
  if (!event) return { skipped: true };
  try {
    await processNotification(event);
    await OutboxEvent.updateOne({ _id: event.id }, { $set: { status: 'completed', completedAt: new Date() }, $unset: { lastError: 1 } });
    return { completed: true };
  } catch (error) {
    const failed = event.attempts >= 3;
    await OutboxEvent.updateOne({ _id: event.id }, { $set: { status: failed ? 'failed' : 'published', lastError: error.message, nextAttemptAt: new Date(Date.now() + 1000 * (2 ** event.attempts)) } });
    throw error;
  }
}
