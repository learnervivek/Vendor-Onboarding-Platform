import mongoose from 'mongoose';

const vendorDocumentSchema = new mongoose.Schema({
  vendorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true, index: true },
  requirement: { type: String, enum: ['registration_certificate', 'identity_document'], required: true },
  version: { type: Number, required: true, default: 1 },
  originalFileName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  storageProvider: { type: String, enum: ['local', 'cloudinary'], required: true },
  storageKey: { type: String, required: true, unique: true },
  processingStatus: { type: String, enum: ['pending', 'clean', 'failed'], default: 'pending', index: true },
  status: { type: String, enum: ['active', 'replaced', 'deleted'], default: 'active', index: true },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

vendorDocumentSchema.index({ vendorProfileId: 1, requirement: 1, status: 1 });
vendorDocumentSchema.index({ processingStatus: 1, createdAt: 1 });
export const VendorDocument = mongoose.model('VendorDocument', vendorDocumentSchema);
