import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/user.js';
import { OutboxEvent } from '../src/models/outbox-event.js';
import { Notification } from '../src/models/notification.js';
import { processEvent } from '../src/queues/process-event.js';
import { processDocumentEvent } from '../src/queues/process-document.js';
import { recoverFailedEvents } from '../src/services/outbox.js';

let mongo;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await mongoose.connection.dropDatabase(); });

describe('notification processing', () => {
  it('creates one logical notification for repeated event delivery', async () => {
    const user = await User.create({ email: 'notify@example.com', name: 'Notify User', role: 'vendor', passwordHash: await bcrypt.hash('password', 4) });
    await OutboxEvent.create({ eventId: 'event-duplicate', type: 'application.approved', aggregateId: new mongoose.Types.ObjectId(), payload: { ownerUserId: user.id, profileId: 'profile', reason: 'Verified.' }, status: 'published' });
    await processEvent('event-duplicate');
    await processEvent('event-duplicate');
    assert.equal(await Notification.countDocuments({ eventId: 'event-duplicate' }), 1);
    assert.equal((await Notification.findOne({ eventId: 'event-duplicate' })).status, 'sent');
    assert.equal((await OutboxEvent.findOne({ eventId: 'event-duplicate' })).status, 'completed');
  });

  it('records bounded processing failures and supports admin recovery', async () => {
    await OutboxEvent.create({ eventId: 'event-failure', type: 'application.rejected', aggregateId: new mongoose.Types.ObjectId(), payload: { ownerUserId: new mongoose.Types.ObjectId().toString(), profileId: 'profile' }, status: 'published' });
    for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(() => processEvent('event-failure'));
    const failed = await OutboxEvent.findOne({ eventId: 'event-failure' });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 3);
    const recovered = await recoverFailedEvents();
    assert.equal(recovered.modifiedCount, 1);
    assert.equal((await OutboxEvent.findOne({ eventId: 'event-failure' })).status, 'pending');
  });

  it('tracks notification delivery state after a delivery failure', async () => {
    await OutboxEvent.create({ eventId: 'event-no-user', type: 'application.submitted', aggregateId: new mongoose.Types.ObjectId(), payload: { ownerUserId: new mongoose.Types.ObjectId().toString(), profileId: 'profile' }, status: 'published' });
    await assert.rejects(() => processEvent('event-no-user'));
    assert.equal((await OutboxEvent.findOne({ eventId: 'event-no-user' })).lastError, 'Notification recipient no longer exists.');
  });

  it('processes document work outside the upload request and is idempotent', async () => {
    const documentId = new mongoose.Types.ObjectId();
    await OutboxEvent.create({ eventId: 'document-event', type: 'document.uploaded', aggregateId: new mongoose.Types.ObjectId(), payload: { documentId: documentId.toString() }, status: 'published' });
    const { VendorDocument } = await import('../src/models/vendor-document.js');
    await VendorDocument.create({ _id: documentId, vendorProfileId: new mongoose.Types.ObjectId(), requirement: 'identity_document', originalFileName: 'id.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageProvider: 'local', storageKey: 'test/document', processingStatus: 'pending' });
    await processDocumentEvent('document-event');
    await processDocumentEvent('document-event');
    assert.equal((await VendorDocument.findById(documentId)).processingStatus, 'clean');
    assert.equal((await OutboxEvent.findOne({ eventId: 'document-event' })).status, 'completed');
  });
});
