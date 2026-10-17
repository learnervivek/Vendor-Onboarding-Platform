import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  role: { type: String, enum: ['vendor', 'reviewer', 'admin'], default: 'vendor', immutable: true, index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  passwordChangedAt: { type: Date }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
