import mongoose from 'mongoose';

const vendorProfileSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  businessName: { type: String, trim: true, maxlength: 200 },
  registrationNumber: { type: String, trim: true, maxlength: 100 },
  businessType: { type: String, enum: ['sole_proprietorship', 'partnership', 'corporation', 'nonprofit', 'other'] },
  contact: {
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40 }
  },
  address: {
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 30 },
    country: { type: String, trim: true, maxlength: 100 }
  },
  status: { type: String, enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected'], default: 'draft', index: true },
  assignedReviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  submittedAt: Date,
  reviewedAt: Date,
  decisionReason: { type: String, maxlength: 2000 }
}, { timestamps: true });

vendorProfileSchema.index({ status: 1, submittedAt: -1 });
vendorProfileSchema.index({ assignedReviewerId: 1, status: 1, updatedAt: -1 });
vendorProfileSchema.index({ ownerUserId: 1, status: 1 });
export const VendorProfile = mongoose.model('VendorProfile', vendorProfileSchema);
