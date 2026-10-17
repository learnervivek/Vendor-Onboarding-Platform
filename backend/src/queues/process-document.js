import { OutboxEvent } from '../models/outbox-event.js';
import { VendorDocument } from '../models/vendor-document.js';

export async function processDocumentEvent(eventId) {
  const event = await OutboxEvent.findOneAndUpdate({ eventId, status: { $in: ['published', 'processing'] } }, { $set: { status: 'processing' }, $inc: { attempts: 1 } }, { new: true });
  if (!event) return { skipped: true };
  try {
    const document = await VendorDocument.findById(event.payload.documentId);
    if (!document) throw new Error('Document no longer exists.');
    if (document.processingStatus !== 'pending') {
      await OutboxEvent.updateOne({ _id: event.id }, { $set: { status: 'completed', completedAt: new Date() } });
      return { completed: true };
    }
    await VendorDocument.updateOne({ _id: document.id, processingStatus: 'pending' }, { $set: { processingStatus: 'clean' } });
    await OutboxEvent.updateOne({ _id: event.id }, { $set: { status: 'completed', completedAt: new Date() }, $unset: { lastError: 1 } });
    return { completed: true };
  } catch (error) {
    const failed = event.attempts >= 3;
    await OutboxEvent.updateOne({ _id: event.id }, { $set: { status: failed ? 'failed' : 'published', lastError: error.message, nextAttemptAt: new Date(Date.now() + 1000 * (2 ** event.attempts)) } });
    throw error;
  }
}
