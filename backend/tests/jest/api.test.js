import { jest } from '@jest/globals';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.COOKIE_SECRET = 'jest-cookie-secret';
process.env.JWT_ACCESS_SECRET = 'jest-access-secret';
process.env.JWT_REFRESH_SECRET = 'jest-refresh-secret';
process.env.LOG_LEVEL = 'silent';
process.env.QUEUE_ADAPTER = 'local';

const storedFiles = new Map();
const deliverEmailPreviewMock = jest.fn(async () => ({ previewPath: '/tmp/mock.eml' }));
jest.unstable_mockModule('../../src/storage/index.js', () => ({
  putPrivate: jest.fn(async (file, ownerId, documentId) => {
    const key = `${ownerId}/${documentId}`;
    storedFiles.set(key, file.buffer);
    return { provider: 'local', key };
  }),
  removePrivate: jest.fn(async (_provider, key) => storedFiles.delete(key)),
  readPrivate: jest.fn(async (_provider, key) => ({ buffer: storedFiles.get(key) }))
}));
jest.unstable_mockModule('../../src/notifications/email-preview.js', () => ({
  deliverEmailPreview: deliverEmailPreviewMock
}));

const { createApp } = await import('../../src/app.js');
const { User } = await import('../../src/models/user.js');
const { VendorProfile } = await import('../../src/models/vendor-profile.js');
const { VendorDocument } = await import('../../src/models/vendor-document.js');
const { AuditLog } = await import('../../src/models/audit-log.js');
const { OutboxEvent } = await import('../../src/models/outbox-event.js');
const { Notification } = await import('../../src/models/notification.js');
const { processNotification } = await import('../../src/notifications/service.js');

const app = createApp();
let mongo;

async function csrf(agent) {
  const response = await agent.get('/api/v1');
  const cookie = response.headers['set-cookie'].find((value) => value.startsWith('edvexa_csrf='));
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

async function registerVendor(email = 'vendor@example.com') {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const response = await agent.post('/api/v1/auth/register')
    .set('x-csrf-token', token)
    .send({ email, name: 'Demo Vendor', password: 'vendor-password-123' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { agent, csrf: token, user: response.body.data.user };
}

async function provisionUser(email, role) {
  const passwordHash = await bcrypt.hash('role-password-123', 4);
  return User.create({ email, name: role, role, passwordHash, passwordChangedAt: new Date() });
}

async function login(email, password = 'role-password-123') {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const response = await agent.post('/api/v1/auth/login')
    .set('x-csrf-token', token)
    .send({ email, password });
  assert.equal(response.status, 200);
  return { agent, csrf: token, user: response.body.data.user };
}

async function completeDraft(vendor) {
  const profile = {
    businessName: 'Demo Supplies Ltd',
    registrationNumber: 'REG-1001',
    businessType: 'corporation',
    contact: { name: 'Demo Contact', email: 'contact@example.com', phone: '+1 555 0100' },
    address: { line1: '1 Market Street', city: 'Austin', state: 'Texas', postalCode: '78701', country: 'US' }
  };
  assert.equal((await vendor.agent.patch('/api/v1/vendor/profile').set('x-csrf-token', vendor.csrf).send(profile)).status, 200);
  for (const requirement of ['registration_certificate', 'identity_document']) {
    const response = await vendor.agent.post('/api/v1/vendor/documents')
      .set('x-csrf-token', vendor.csrf)
      .field('requirement', requirement)
      .attach('file', Buffer.from('%PDF-1.4 demo document'), `${requirement}.pdf`);
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }
  return (await VendorProfile.findOne({ ownerUserId: vendor.user.id })).id;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
  storedFiles.clear();
  deliverEmailPreviewMock.mockReset();
  deliverEmailPreviewMock.mockResolvedValue({ previewPath: '/tmp/mock.eml' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Edvexa API with Jest and Supertest', () => {
  test('registers vendors, logs in, verifies JWT-backed sessions, and logs out', async () => {
    const docs = await request(app).get('/api/v1/docs/openapi.json');
    assert.equal(docs.status, 200);
    assert.equal(docs.body.openapi, '3.0.3');
    const vendor = await registerVendor();
    assert.equal((await vendor.agent.get('/api/v1/auth/me')).status, 200);
    assert.equal((await vendor.agent.post('/api/v1/auth/logout').set('x-csrf-token', vendor.csrf)).status, 204);
    assert.equal((await vendor.agent.get('/api/v1/auth/me')).status, 401);
    const loggedIn = await login('vendor@example.com', 'vendor-password-123');
    assert.equal(loggedIn.user.role, 'vendor');
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', 'edvexa_access=s.invalid.token')).status, 401);
  });

  test('enforces RBAC and resource ownership', async () => {
    const vendor = await registerVendor();
    const other = await registerVendor('other@example.com');
    const reviewerUser = await provisionUser('reviewer@example.com', 'reviewer');
    const reviewer = await login(reviewerUser.email);
    const profileId = await completeDraft(vendor);
    const otherProfileId = (await other.agent.get('/api/v1/vendor/profile')).body.data.profile._id;
    assert.equal((await reviewer.agent.get(`/api/v1/vendor/applications/${profileId}`)).status, 403);
    assert.equal((await other.agent.get(`/api/v1/vendor/applications/${profileId}`)).status, 403);
    assert.equal((await vendor.agent.get(`/api/v1/vendor/applications/${otherProfileId}`)).status, 403);
  });

  test('rejects invalid documents and incomplete submissions', async () => {
    const vendor = await registerVendor();
    const invalid = await vendor.agent.post('/api/v1/vendor/documents')
      .set('x-csrf-token', vendor.csrf)
      .field('requirement', 'identity_document')
      .attach('file', Buffer.from('not an image or pdf'), 'identity.pdf');
    assert.equal(invalid.status, 400);
    const submit = await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrf);
    assert.equal(submit.status, 400);
    assert.equal(submit.body.error.code, 'INCOMPLETE_APPLICATION');
  });

  test('supports every valid transition and rejects invalid transitions', async () => {
    const vendor = await registerVendor();
    const reviewerUser = await provisionUser('reviewer@example.com', 'reviewer');
    const reviewer = await login(reviewerUser.email);
    const profileId = await completeDraft(vendor);
    assert.equal((await reviewer.agent.post(`/api/v1/reviews/${profileId}/claim`).set('x-csrf-token', reviewer.csrf)).status, 409);
    assert.equal((await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrf)).status, 200);
    assert.equal((await reviewer.agent.post(`/api/v1/reviews/${profileId}/claim`).set('x-csrf-token', reviewer.csrf)).status, 200);
    assert.equal((await reviewer.agent.post(`/api/v1/reviews/${profileId}/approve`).set('x-csrf-token', reviewer.csrf).send({ reason: 'All checks passed.' })).status, 200);
    const invalid = await reviewer.agent.post(`/api/v1/reviews/${profileId}/reject`).set('x-csrf-token', reviewer.csrf).send({ reason: 'Too late.' });
    assert.equal(invalid.status, 409);
    assert.equal(await AuditLog.countDocuments({ resourceId: profileId }), 3);
  });

  test('supports rejection, correction, resubmission, and append-only audit history', async () => {
    const vendor = await registerVendor();
    const reviewerUser = await provisionUser('reviewer@example.com', 'reviewer');
    const reviewer = await login(reviewerUser.email);
    const profileId = await completeDraft(vendor);
    await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrf);
    await reviewer.agent.post(`/api/v1/reviews/${profileId}/claim`).set('x-csrf-token', reviewer.csrf);
    assert.equal((await reviewer.agent.post(`/api/v1/reviews/${profileId}/reject`).set('x-csrf-token', reviewer.csrf).send({ reason: 'Registration number needs correction.' })).status, 200);
    assert.equal((await vendor.agent.patch('/api/v1/vendor/profile').set('x-csrf-token', vendor.csrf).send({ businessName: 'Corrected Supplies Ltd' })).status, 200);
    assert.equal((await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrf)).status, 200);
    const audit = await vendor.agent.get(`/api/v1/vendor/applications/${profileId}/audit`);
    assert.equal(audit.status, 403);
    const reviewerAudit = await reviewer.agent.get(`/api/v1/reviews/${profileId}/audit`);
    assert.equal(reviewerAudit.status, 200);
    assert.deepEqual(reviewerAudit.body.data.audit.map((entry) => entry.newStatus), ['submitted', 'under_review', 'rejected', 'submitted']);
    const record = await AuditLog.findOne({ resourceId: profileId });
    await assert.rejects(() => AuditLog.updateOne({ _id: record.id }, { $set: { reason: 'tampered' } }));
  });

  test('prevents concurrent reviewer claims and duplicate event notifications', async () => {
    const vendor = await registerVendor();
    const reviewerOneUser = await provisionUser('reviewer-one@example.com', 'reviewer');
    const reviewerTwoUser = await provisionUser('reviewer-two@example.com', 'reviewer');
    const reviewerOne = await login(reviewerOneUser.email);
    const reviewerTwo = await login(reviewerTwoUser.email);
    const profileId = await completeDraft(vendor);
    await vendor.agent.post('/api/v1/vendor/submit').set('x-csrf-token', vendor.csrf);
    const claims = await Promise.all([
      reviewerOne.agent.post(`/api/v1/reviews/${profileId}/claim`).set('x-csrf-token', reviewerOne.csrf),
      reviewerTwo.agent.post(`/api/v1/reviews/${profileId}/claim`).set('x-csrf-token', reviewerTwo.csrf)
    ]);
    assert.equal(claims.filter((response) => response.status === 200).length, 1);
    const event = await OutboxEvent.create({ eventId: 'stable-event-1', type: 'application.submitted', aggregateId: profileId, payload: { ownerUserId: vendor.user.id } });
    await processNotification(event);
    await processNotification(event);
    assert.equal(await Notification.countDocuments({ eventId: event.eventId }), 1);
  });

  test('records a notification failure and succeeds on a bounded retry', async () => {
    const vendor = await registerVendor();
    const profileId = await completeDraft(vendor);
    const event = await OutboxEvent.create({ eventId: 'retry-event-1', type: 'application.submitted', aggregateId: profileId, payload: { ownerUserId: vendor.user.id } });
    deliverEmailPreviewMock.mockRejectedValueOnce(new Error('temporary mail failure'));
    await expect(processNotification(event)).rejects.toThrow('temporary mail failure');
    assert.equal((await Notification.findOne({ eventId: event.eventId })).status, 'failed');
    await processNotification(event);
    assert.equal((await Notification.findOne({ eventId: event.eventId })).status, 'sent');
  });
});
