import mongoose from 'mongoose';

const outboxEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, immutable: true },
  type: { type: String, enum: ['document.uploaded', 'application.submitted', 'application.approved', 'application.rejected'], required: true, immutable: true },
  aggregateId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true, immutable: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  status: { type: String, enum: ['pending', 'published', 'processing', 'completed', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastError: { type: String, maxlength: 2000 },
  publishedAt: Date,
  completedAt: Date
}, { timestamps: true });

outboxEventSchema.index({ status: 1, nextAttemptAt: 1 });
outboxEventSchema.index({ aggregateId: 1, createdAt: -1 });
export const OutboxEvent = mongoose.model('OutboxEvent', outboxEventSchema);
