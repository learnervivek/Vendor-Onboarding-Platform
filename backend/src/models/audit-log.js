import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  actorRole: { type: String, enum: ['vendor', 'reviewer', 'admin'], required: true, immutable: true },
  resourceType: { type: String, enum: ['vendor_profile'], required: true, immutable: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true, index: true, immutable: true },
  previousStatus: { type: String, required: true, immutable: true },
  newStatus: { type: String, required: true, immutable: true },
  decisionReason: { type: String, maxlength: 2000, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false });

auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('Audit history is append-only.');
});

auditLogSchema.index({ resourceId: 1, createdAt: 1 });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
