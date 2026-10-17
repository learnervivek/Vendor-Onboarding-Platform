import { VendorDocument } from '../models/vendor-document.js';
import { VendorProfile } from '../models/vendor-profile.js';
import { removePrivate, putPrivate, readPrivate } from '../storage/index.js';
import { fileError, inspectFile } from '../storage/file-validation.js';
import { transitionApplication } from './application-lifecycle.js';
import { OutboxEvent } from '../models/outbox-event.js';
import crypto from 'node:crypto';

const requiredRequirements = ['registration_certificate', 'identity_document'];
const fields = ['businessName', 'registrationNumber', 'businessType', 'contact', 'address'];

function bad(message, code = 'INVALID_PROFILE') {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

export async function getOrCreateProfile(ownerUserId) {
  return VendorProfile.findOneAndUpdate({ ownerUserId }, { $setOnInsert: { ownerUserId } }, { new: true, upsert: true });
}

export async function updateProfile(ownerUserId, updates) {
  const profile = await getOrCreateProfile(ownerUserId);
  if (['submitted', 'under_review', 'approved'].includes(profile.status)) throw bad('This application cannot be edited in its current state.', 'PROFILE_NOT_EDITABLE');
  fields.forEach((field) => { if (updates[field] !== undefined) profile[field] = updates[field]; });
  await profile.save();
  return profile;
}

export async function uploadDocument(ownerUserId, requirement, file) {
  if (!requiredRequirements.includes(requirement)) throw bad('Unsupported document requirement.', 'INVALID_REQUIREMENT');
  if (!inspectFile(file)) throw fileError('File extension, MIME type, size, or file signature is invalid.');
  const profile = await getOrCreateProfile(ownerUserId);
  if (['submitted', 'under_review', 'approved'].includes(profile.status)) throw bad('This application cannot be edited in its current state.', 'PROFILE_NOT_EDITABLE');
  const previous = await VendorDocument.findOne({ vendorProfileId: profile.id, requirement, status: 'active' });
  const count = await VendorDocument.countDocuments({ vendorProfileId: profile.id, status: 'active' });
  if (!previous && count >= requiredRequirements.length) throw bad('The maximum number of active documents has been reached.', 'DOCUMENT_LIMIT_REACHED');
  const document = new VendorDocument({ vendorProfileId: profile.id, requirement, version: (previous?.version ?? 0) + 1, originalFileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, storageProvider: 'local', storageKey: 'pending' });
  const stored = await putPrivate(file, ownerUserId, document.id);
  document.storageProvider = stored.provider;
  document.storageKey = stored.key;
  try {
    if (previous) { previous.status = 'replaced'; await previous.save(); }
    await document.save();
    await OutboxEvent.create({
      eventId: crypto.randomUUID(),
      type: 'document.uploaded',
      aggregateId: profile.id,
      payload: { documentId: document.id, profileId: profile.id.toString(), ownerUserId: ownerUserId.toString() }
    });
    if (previous) await removePrivate(previous.storageProvider, previous.storageKey);
  } catch (error) {
    await VendorDocument.deleteOne({ _id: document.id }).catch(() => {});
    await removePrivate(stored.provider, stored.key).catch(() => {});
    throw error;
  }
  return document;
}

export async function listDocuments(ownerUserId) {
  const profile = await getOrCreateProfile(ownerUserId);
  return VendorDocument.find({ vendorProfileId: profile.id, status: 'active' }).sort({ requirement: 1 });
}

export async function getAuthorizedDocument(ownerUserId, documentId) {
  const profile = await VendorProfile.findOne({ ownerUserId });
  const document = profile && await VendorDocument.findOne({ _id: documentId, vendorProfileId: profile.id, status: 'active' });
  if (!document) throw Object.assign(new Error('Document not found.'), { statusCode: 404, code: 'DOCUMENT_NOT_FOUND' });
  return document;
}

export async function deleteDocument(ownerUserId, documentId) {
  const document = await getAuthorizedDocument(ownerUserId, documentId);
  document.status = 'deleted';
  await document.save();
  await removePrivate(document.storageProvider, document.storageKey);
}

export async function submitProfile(ownerUserId) {
  const profile = await getOrCreateProfile(ownerUserId);
  const requiredValues = {
    businessName: profile.businessName,
    registrationNumber: profile.registrationNumber,
    businessType: profile.businessType,
    'contact.name': profile.contact?.name,
    'contact.email': profile.contact?.email,
    'contact.phone': profile.contact?.phone,
    'address.line1': profile.address?.line1,
    'address.city': profile.address?.city,
    'address.state': profile.address?.state,
    'address.postalCode': profile.address?.postalCode,
    'address.country': profile.address?.country
  };
  const missing = Object.entries(requiredValues).filter(([, value]) => !value).map(([field]) => field);
  const documents = await VendorDocument.find({ vendorProfileId: profile.id, status: 'active' });
  const uploaded = new Set(documents.map((document) => document.requirement));
  const missingDocuments = requiredRequirements.filter((requirement) => !uploaded.has(requirement));
  if (missing.length || missingDocuments.length) throw bad('Complete all profile fields and required documents before submitting.', 'INCOMPLETE_APPLICATION');
  return transitionApplication({ profileId: profile.id, actor: { id: ownerUserId, role: 'vendor' }, toStatus: 'submitted' });
}

export { readPrivate };
