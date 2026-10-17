import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.COOKIE_SECRET = 'test-cookie-secret';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const app = createApp();
let mongo;

async function csrf(agent) {
  const response = await agent.get('/api/v1');
  const cookie = response.headers['set-cookie'].find((item) => item.startsWith('edvexa_csrf='));
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

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
});

describe('authentication and authorization', () => {
  it('registers vendors only and returns current user from a cookie session', async () => {
    const agent = request.agent(app);
    const token = await csrf(agent);
    const registered = await agent.post('/api/v1/auth/register').set('x-csrf-token', token).send({ email: 'vendor@example.com', name: 'Vendor User', password: 'a-strong-password-123' });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.data.user.role, 'vendor');
    assert.equal((await agent.get('/api/v1/auth/me')).status, 200);
  });

  it('rejects unauthenticated and forbidden role access', async () => {
    assert.equal((await request(app).get('/api/v1/auth/me')).status, 401);
    const agent = request.agent(app);
    const token = await csrf(agent);
    await agent.post('/api/v1/auth/register').set('x-csrf-token', token).send({ email: 'vendor@example.com', name: 'Vendor User', password: 'a-strong-password-123' });
    assert.equal((await agent.post('/api/v1/admin/users').set('x-csrf-token', token).send({ email: 'reviewer@example.com', name: 'Reviewer', role: 'reviewer', temporaryPassword: 'another-strong-password' })).status, 403);
  });

  it('rejects invalid access tokens and CSRF failures', async () => {
    const agent = request.agent(app);
    const token = await csrf(agent);
    await agent.post('/api/v1/auth/register').set('x-csrf-token', token).send({ email: 'vendor@example.com', name: 'Vendor User', password: 'a-strong-password-123' });
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', 'edvexa_access=s:invalid.invalid.invalid')).status, 401);
    assert.equal((await agent.post('/api/v1/auth/logout')).status, 403);
  });

  it('does not permit a public role escalation field', async () => {
    const agent = request.agent(app);
    const token = await csrf(agent);
    const response = await agent.post('/api/v1/auth/register').set('x-csrf-token', token).send({ email: 'vendor@example.com', name: 'Vendor User', password: 'a-strong-password-123', role: 'admin' });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.user.role, 'vendor');
    assert.equal(await User.countDocuments({ role: 'admin' }), 0);
  });
});
