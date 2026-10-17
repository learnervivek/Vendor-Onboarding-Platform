import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.js';
import { VendorDocument } from '../src/models/vendor-document.js';
import { VendorProfile } from '../src/models/vendor-profile.js';

const app = createApp();
let mongo;

async function csrf(agent) {
  const response = await agent.get('/api/v1');
  const cookie = response.headers['set-cookie'].find((item) => item.startsWith('edvexa_csrf='));
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

async function createVendor(email) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  await agent.post('/api/v1/auth/register').set('x-csrf-token', token).send({ email, name: 'Vendor User', password: 'a-strong-password-123' });
  return { agent, token };
}

const validProfile = {
  businessName: 'Acme Supplies',
  registrationNumber: 'REG-123',
  businessType: 'corporation',
  contact: { name: 'Contact Person', email: 'contact@acme.test', phone: '+123456789' },
  address: { line1: '1 Main Street', line2: '', city: 'Austin', state: 'Texas', postalCode: '78701', country: 'US' }
};

const validPdf = Buffer.from('%PDF-1.7\nvalid test file');

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await VendorProfile.deleteMany({});
  await VendorDocument.deleteMany({});
});

describe('vendor profiles and documents', () => {
  it('creates and edits a draft, then rejects incomplete submission', async () => {
    const { agent, token } = await createVendor('one@example.com');
    const saved = await agent.patch('/api/v1/vendor/profile').set('x-csrf-token', token).send(validProfile);
    assert.equal(saved.status, 200);
    const submitted = await agent.post('/api/v1/vendor/submit').set('x-csrf-token', token);
    assert.equal(submitted.status, 400);
    assert.equal(submitted.body.error.code, 'INCOMPLETE_APPLICATION');
  });

  it('rejects spoofed file signatures and accepts a valid required document', async () => {
    const { agent, token } = await createVendor('two@example.com');
    const invalid = await agent.post('/api/v1/vendor/documents').set('x-csrf-token', token).field('requirement', 'identity_document').attach('file', Buffer.from('not a pdf'), { filename: 'identity.pdf', contentType: 'application/pdf' });
    assert.equal(invalid.status, 400);
    const valid = await agent.post('/api/v1/vendor/documents').set('x-csrf-token', token).field('requirement', 'identity_document').attach('file', validPdf, { filename: 'identity.pdf', contentType: 'application/pdf' });
    assert.equal(valid.status, 201);
  });

  it('prevents cross-vendor document access', async () => {
    const first = await createVendor('three@example.com');
    const upload = await first.agent.post('/api/v1/vendor/documents').set('x-csrf-token', first.token).field('requirement', 'identity_document').attach('file', validPdf, { filename: 'identity.pdf', contentType: 'application/pdf' });
    const second = await createVendor('four@example.com');
    const response = await second.agent.get(`/api/v1/vendor/documents/${upload.body.data.document._id}`);
    assert.equal(response.status, 404);
  });

  it('replaces one document version and prevents duplicate active requirements', async () => {
    const { agent, token } = await createVendor('five@example.com');
    const first = await agent.post('/api/v1/vendor/documents').set('x-csrf-token', token).field('requirement', 'identity_document').attach('file', validPdf, { filename: 'identity.pdf', contentType: 'application/pdf' });
    const replacement = await agent.post('/api/v1/vendor/documents').set('x-csrf-token', token).field('requirement', 'identity_document').attach('file', Buffer.from('%PDF-2.0\nreplacement'), { filename: 'identity-2.pdf', contentType: 'application/pdf' });
    assert.equal(replacement.status, 201);
    assert.equal(replacement.body.data.document.version, 2);
    assert.equal(await VendorDocument.countDocuments({ status: 'active' }), 1);
    assert.notEqual(first.body.data.document._id, replacement.body.data.document._id);
  });
});
