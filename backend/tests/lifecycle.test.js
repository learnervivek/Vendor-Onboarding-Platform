import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { AuditLog } from '../src/models/audit-log.js';
import { User } from '../src/models/user.js';
import { VendorDocument } from '../src/models/vendor-document.js';
import { VendorProfile } from '../src/models/vendor-profile.js';

const app = createApp();
let mongo;
const pdf = Buffer.from('%PDF-1.7\nlifecycle');
const profile = { businessName: 'Lifecycle Co', registrationNumber: 'LC-1', businessType: 'corporation', contact: { name: 'Owner Name', email: 'owner@life.test', phone: '123456789' }, address: { line1: '1 Main', line2: '', city: 'Austin', state: 'Texas', postalCode: '78701', country: 'US' } };

async function csrf(agent) {
  const response = await agent.get('/api/v1');
  return decodeURIComponent(response.headers['set-cookie'].find((item) => item.startsWith('edvexa_csrf=')).split(';')[0].split('=')[1]);
}

async function login(email, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const response = await agent.post('/api/v1/auth/login').set('x-csrf-token', token).send({ email, password });
  assert.equal(response.status, 200);
  return { agent, token };
}

async function provision(email, role) {
  const password = 'a-strong-provisioned-password';
  const user = await User.create({ email, name: role, role, passwordHash: await bcrypt.hash(password, 12) });
  return { user, password };
}

async function createCompleteVendor() {
  const agent = request.agent(app);
  const csrfToken = await csrf(agent);
  const registration = await agent.post('/api/v1/auth/register').set('x-csrf-token', csrfToken).send({ email: `vendor-${Date.now()}@test.com`, name: 'Vendor', password: 'a-strong-password-123' });
  const user = await User.findOne({ _id: registration.body.data.user.id });
  await agent.patch('/api/v1/vendor/profile').set('x-csrf-token', csrfToken).send(profile);
  for (const requirement of ['registration_certificate', 'identity_document']) {
    await agent.post('/api/v1/vendor/documents').set('x-csrf-token', csrfToken).field('requirement', requirement).attach('file', pdf, { filename: `${requirement}.pdf`, contentType: 'application/pdf' });
  }
  const submitted = await agent.post('/api/v1/vendor/submit').set('x-csrf-token', csrfToken);
  assert.equal(submitted.status, 200);
  return { agent, csrfToken, profileId: submitted.body.data.profile._id, user };
}

before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await mongoose.connection.dropDatabase(); });

describe('application lifecycle', () => {
  it('allows only draft -> submitted -> under_review -> approved', async () => {
    const vendor = await createCompleteVendor();
    const reviewer = await provision('reviewer@test.com', 'reviewer');
    const review = await login(reviewer.user.email, reviewer.password);
    const claim = await review.agent.post(`/api/v1/reviews/${vendor.profileId}/claim`).set('x-csrf-token', review.token);
    assert.equal(claim.status, 200);
    const approved = await review.agent.post(`/api/v1/reviews/${vendor.profileId}/approve`).set('x-csrf-token', review.token).send({ reason: 'All documents verified.' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.profile.status, 'approved');
    const invalid = await review.agent.post(`/api/v1/reviews/${vendor.profileId}/reject`).set('x-csrf-token', review.token).send({ reason: 'Too late.' });
    assert.equal(invalid.status, 409);
    assert.equal(invalid.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('requires a decision reason and allows rejected applications to be corrected and resubmitted', async () => {
    const vendor = await createCompleteVendor();
    const reviewer = await provision('reviewer2@test.com', 'reviewer');
    const review = await login(reviewer.user.email, reviewer.password);
    await review.agent.post(`/api/v1/reviews/${vendor.profileId}/claim`).set('x-csrf-token', review.token);
    const missingReason = await review.agent.post(`/api/v1/reviews/${vendor.profileId}/reject`).set('x-csrf-token', review.token).send({});
    assert.equal(missingReason.status, 400);
    const rejected = await review.agent.post(`/api/v1/reviews/${vendor.profileId}/reject`).set('x-csrf-token', review.token).send({ reason: 'Registration certificate is unreadable.' });
    assert.equal(rejected.status, 200);
    const corrected = await vendor.agent.patch('/api/v1/vendor/profile').set('x-csrf-token', vendor.csrfToken).send({ businessName: 'Lifecycle Co Corrected' });
    assert.equal(corrected.status, 200);
    const resubmitted = await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrfToken);
    assert.equal(resubmitted.status, 200);
    assert.equal(resubmitted.body.data.profile.status, 'submitted');
  });

  it('prevents reviewers from deciding another reviewer’s application and records immutable audit history', async () => {
    const vendor = await createCompleteVendor();
    const first = await provision('reviewer3@test.com', 'reviewer');
    const second = await provision('reviewer4@test.com', 'reviewer');
    const firstSession = await login(first.user.email, first.password);
    const secondSession = await login(second.user.email, second.password);
    await firstSession.agent.post(`/api/v1/reviews/${vendor.profileId}/claim`).set('x-csrf-token', firstSession.token);
    const forbidden = await secondSession.agent.post(`/api/v1/reviews/${vendor.profileId}/approve`).set('x-csrf-token', secondSession.token).send({ reason: 'Not my review.' });
    assert.equal(forbidden.status, 403);
    const audit = await firstSession.agent.get(`/api/v1/reviews/${vendor.profileId}/audit`);
    assert.equal(audit.status, 200);
    assert.deepEqual(audit.body.data.audit.map((entry) => [entry.previousStatus, entry.newStatus]), [['draft', 'submitted'], ['submitted', 'under_review']]);
    const log = await AuditLog.findOne();
    await assert.rejects(() => AuditLog.deleteOne({ _id: log.id }), /append-only/);
  });

  it('allows admins to oversee applications but not vendors to read another application', async () => {
    const vendor = await createCompleteVendor();
    const other = await createCompleteVendor();
    const response = await other.agent.get(`/api/v1/vendor/applications/${vendor.profileId}`);
    assert.equal(response.status, 403);
    const admin = await provision('admin@test.com', 'admin');
    const session = await login(admin.user.email, admin.password);
    const applications = await session.agent.get('/api/v1/admin/applications');
    assert.equal(applications.status, 200);
    assert.equal(applications.body.data.applications.length, 2);
  });
});
