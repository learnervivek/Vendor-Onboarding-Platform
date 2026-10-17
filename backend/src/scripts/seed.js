import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/user.js';
import { VendorProfile } from '../models/vendor-profile.js';

const password = 'DemoPassword-123!';
const users = [
  ['vendor.draft@example.com', 'Draft Vendor', 'vendor'],
  ['vendor.submitted@example.com', 'Submitted Vendor', 'vendor'],
  ['vendor.review@example.com', 'Review Vendor', 'vendor'],
  ['vendor.approved@example.com', 'Approved Vendor', 'vendor'],
  ['vendor.rejected@example.com', 'Rejected Vendor', 'vendor'],
  ['reviewer@example.com', 'Demo Reviewer', 'reviewer'],
  ['admin@example.com', 'Demo Admin', 'admin']
];

const statusByEmail = new Map(users.slice(0, 5).map(([email], index) => [email, ['draft', 'submitted', 'under_review', 'approved', 'rejected'][index]]));

async function upsertUser(email, name, role, passwordHash) {
  return User.findOneAndUpdate(
    { email },
    { $set: { name, role, status: 'active', passwordHash, passwordChangedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seed() {
  await connectDatabase();
  const passwordHash = await bcrypt.hash(password, 12);
  const created = new Map();
  for (const [email, name, role] of users) created.set(email, await upsertUser(email, name, role, passwordHash));

  const reviewer = created.get('reviewer@example.com');
  for (const [email, , role] of users.slice(0, 5)) {
    const status = statusByEmail.get(email);
    await VendorProfile.findOneAndUpdate(
      { ownerUserId: created.get(email)._id },
      {
        $set: {
          businessName: `${role === 'vendor' ? 'Demo' : ''} ${status} Supplies`,
          registrationNumber: `SEED-${status.toUpperCase()}`,
          businessType: 'corporation',
          contact: { name: 'Demo Contact', email, phone: '+1 555 0100' },
          address: { line1: '1 Market Street', city: 'Austin', state: 'Texas', postalCode: '78701', country: 'US' },
          status,
          assignedReviewerId: ['under_review', 'approved', 'rejected'].includes(status) ? reviewer._id : undefined,
          submittedAt: status === 'draft' ? undefined : new Date(),
          reviewedAt: ['approved', 'rejected'].includes(status) ? new Date() : undefined,
          decisionReason: status === 'rejected' ? 'Please correct the registration details.' : undefined
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${users.length} users and demo applications for every workflow status.`);
  console.log(`Demo password for all users: ${password}`);
}

try {
  await seed();
} finally {
  if (mongoose.connection.readyState !== 0) await disconnectDatabase();
}
