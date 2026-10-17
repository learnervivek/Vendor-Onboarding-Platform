import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, immutable: true },
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  type: { type: String, required: true, immutable: true },
  subject: { type: String, required: true, immutable: true },
  message: { type: String, required: true, immutable: true },
  channel: { type: String, enum: ['email_preview', 'in_app'], default: 'email_preview', immutable: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 2000 },
  sentAt: Date,
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false });

export const Notification = mongoose.model('Notification', notificationSchema);
