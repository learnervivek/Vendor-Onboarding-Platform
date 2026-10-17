import { User } from '../models/user.js';
import { Notification } from '../models/notification.js';
import { deliverEmailPreview } from './email-preview.js';

const messages = {
  'application.submitted': ['Application submitted', 'Your vendor application was submitted and is ready for review.'],
  'application.approved': ['Application approved', 'Your vendor application has been approved.'],
  'application.rejected': ['Corrections requested', 'Your vendor application needs corrections before it can be resubmitted.']
};

export async function processNotification(event) {
  const user = await User.findById(event.payload.ownerUserId);
  if (!user) throw new Error('Notification recipient no longer exists.');
  const [subject, message] = messages[event.type] ?? ['Application update', 'Your application status has changed.'];
  let notification = await Notification.findOne({ eventId: event.eventId });
  if (notification?.status === 'sent') return notification;
  if (!notification) {
    try {
      notification = await Notification.create({ eventId: event.eventId, recipientUserId: user.id, type: event.type, subject, message });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      notification = await Notification.findOne({ eventId: event.eventId });
    }
  }
  await Notification.updateOne({ _id: notification.id }, { $set: { status: 'pending' }, $inc: { attempts: 1 } });
  try {
    await deliverEmailPreview({ eventId: event.eventId, recipient: user.email, subject, message: `${message}${event.payload.reason ? `\n\nReason: ${event.payload.reason}` : ''}` });
    await Notification.updateOne({ _id: notification.id }, { $set: { status: 'sent', sentAt: new Date(), lastError: undefined } });
  } catch (error) {
    await Notification.updateOne({ _id: notification.id }, { $set: { status: 'failed', lastError: error.message } });
    throw error;
  }
  return Notification.findById(notification.id);
}
