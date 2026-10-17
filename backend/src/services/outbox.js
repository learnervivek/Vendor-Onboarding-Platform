import { OutboxEvent } from '../models/outbox-event.js';
import { enqueueEvent } from '../queues/queue.js';

export async function publishPendingEvents(limit = 50) {
  const events = await OutboxEvent.find({ status: 'pending', nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit);
  let published = 0;
  for (const event of events) {
    const claimed = await OutboxEvent.findOneAndUpdate({ _id: event.id, status: 'pending' }, { $set: { status: 'published', publishedAt: new Date() } }, { new: true });
    if (!claimed) continue;
    try {
      const queued = await enqueueEvent(claimed);
      if (!queued) await OutboxEvent.updateOne({ _id: claimed.id }, { $set: { status: 'published' } });
      published += 1;
    } catch (error) {
      await OutboxEvent.updateOne({ _id: claimed.id }, { $set: { status: 'pending', lastError: error.message, nextAttemptAt: new Date(Date.now() + 1000) } });
    }
  }
  return published;
}

export async function recoverFailedEvents(limit = 50) {
  const failed = await OutboxEvent.find({ status: 'failed' }).select('_id').limit(limit);
  return OutboxEvent.updateMany({ _id: { $in: failed.map((event) => event.id) } }, { $set: { status: 'pending', nextAttemptAt: new Date() }, $unset: { lastError: 1 } });
}
