import mongoose from 'mongoose';
import { AuditLog } from '../models/audit-log.js';
import { VendorProfile } from '../models/vendor-profile.js';
import { VendorDocument } from '../models/vendor-document.js';
import { User } from '../models/user.js';
import { OutboxEvent } from '../models/outbox-event.js';
import crypto from 'node:crypto';
import { escapeRegex } from '../utils/query.js';

const transitions = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  rejected: ['submitted'],
  approved: []
};

function domainError(message, code, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function ensureTransition(from, to) {
  if (!transitions[from]?.includes(to)) throw domainError(`Cannot transition application from ${from} to ${to}.`, 'INVALID_STATUS_TRANSITION');
}

export async function transitionApplication({ profileId, actor, toStatus, reason }) {
  if (['rejected', 'approved'].includes(toStatus) && (!reason || reason.trim().length < 3)) {
    throw domainError('A decision reason is required.', 'DECISION_REASON_REQUIRED', 400);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    const execute = async (dbSession) => {
      const current = await VendorProfile.findById(profileId).session(dbSession);
      if (!current) throw domainError('Application not found.', 'APPLICATION_NOT_FOUND', 404);
      if (actor.role === 'vendor' && String(current.ownerUserId) !== String(actor.id)) throw domainError('You do not have access to this application.', 'FORBIDDEN', 403);
      if (actor.role === 'reviewer' && String(current.assignedReviewerId) !== String(actor.id)) throw domainError('You do not own this review.', 'FORBIDDEN', 403);
      ensureTransition(current.status, toStatus);
      const updated = await VendorProfile.findOneAndUpdate(
        { _id: profileId, status: current.status, ...(toStatus === 'under_review' ? { assignedReviewerId: null } : {}) },
        { $set: { status: toStatus, decisionReason: reason?.trim(), reviewedAt: ['approved', 'rejected'].includes(toStatus) ? new Date() : undefined, assignedReviewerId: toStatus === 'submitted' ? null : current.assignedReviewerId } },
        { new: true, session: dbSession }
      );
      if (!updated) throw domainError('The application changed before your decision was saved.', 'APPLICATION_CONFLICT');
      await AuditLog.create([{ actorUserId: actor.id, actorRole: actor.role, resourceType: 'vendor_profile', resourceId: current.id, previousStatus: current.status, newStatus: toStatus, decisionReason: reason?.trim() }], { session: dbSession });
      if (['submitted', 'approved', 'rejected'].includes(toStatus)) {
        const eventType = `application.${toStatus}`;
        await OutboxEvent.create([{
          eventId: crypto.randomUUID(),
          type: eventType,
          aggregateId: current.id,
          payload: { profileId: current.id.toString(), ownerUserId: current.ownerUserId.toString(), reason: reason?.trim() ?? null, actorUserId: actor.id.toString() }
        }], { session: dbSession });
      }
      return updated;
    };
    try {
      session.startTransaction();
      result = await execute(session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      if (error?.code === 20 || /transaction numbers/i.test(error?.message ?? '')) {
        result = await execute(null);
      } else throw error;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function claimApplication({ profileId, reviewer }) {
  const updated = await VendorProfile.findOneAndUpdate(
    { _id: profileId, status: 'submitted', $or: [{ assignedReviewerId: null }, { assignedReviewerId: { $exists: false } }] },
    { $set: { status: 'under_review', assignedReviewerId: reviewer.id } },
    { new: true }
  );
  if (!updated) throw domainError('Application is no longer available to claim.', 'APPLICATION_CONFLICT');
  try {
    await AuditLog.create({ actorUserId: reviewer.id, actorRole: reviewer.role, resourceType: 'vendor_profile', resourceId: updated.id, previousStatus: 'submitted', newStatus: 'under_review' });
  } catch (error) {
    await VendorProfile.updateOne({ _id: profileId, status: 'under_review', assignedReviewerId: reviewer.id }, { $set: { status: 'submitted', assignedReviewerId: null } });
    throw error;
  }
  return updated;
}

export async function listApplications(filter = {}, options = {}) {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 50);
  const query = { ...filter };
  if (options.status) query.status = options.status;
  if (options.from || options.to) {
    query.submittedAt = {};
    if (options.from) query.submittedAt.$gte = new Date(options.from);
    if (options.to) query.submittedAt.$lte = new Date(`${options.to}T23:59:59.999Z`);
  }
  if (options.search) {
    const safeSearch = escapeRegex(options.search);
    const users = await User.find({ $or: [{ name: new RegExp(safeSearch, 'i') }, { email: new RegExp(safeSearch, 'i') }] }).select('_id');
    query.$or = [{ businessName: new RegExp(safeSearch, 'i') }, { registrationNumber: new RegExp(safeSearch, 'i') }, { ownerUserId: { $in: users.map((user) => user.id) } }];
  }
  const [applications, total] = await Promise.all([
    VendorProfile.find(query).populate('ownerUserId', 'name email').populate('assignedReviewerId', 'name email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    VendorProfile.countDocuments(query)
  ]);
  return { applications, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getApplicationDetails(profileId, actor) {
  const profile = await getApplicationForActor(profileId, actor);
  const [documents, audit] = await Promise.all([
    VendorDocument.find({ vendorProfileId: profile.id, status: 'active' }).select('-storageKey'),
    actor.role === 'vendor' ? [] : AuditLog.find({ resourceId: profile.id }).sort({ createdAt: 1 })
  ]);
  return { profile, documents, audit };
}

export async function getAuthorizedDocumentForActor(profileId, documentId, actor) {
  const profile = await getApplicationForActor(profileId, actor);
  const document = await VendorDocument.findOne({ _id: documentId, vendorProfileId: profile.id, status: 'active' });
  if (!document) throw domainError('Document not found.', 'DOCUMENT_NOT_FOUND', 404);
  return document;
}

export async function getApplicationForActor(profileId, actor) {
  const profile = await VendorProfile.findById(profileId);
  if (!profile) throw domainError('Application not found.', 'APPLICATION_NOT_FOUND', 404);
  if (actor.role === 'vendor' && String(profile.ownerUserId) !== String(actor.id)) throw domainError('You do not have access to this application.', 'FORBIDDEN', 403);
  if (actor.role === 'reviewer' && profile.assignedReviewerId && String(profile.assignedReviewerId) !== String(actor.id)) throw domainError('You do not have access to this application.', 'FORBIDDEN', 403);
  return profile;
}

export async function listAuditHistory(profileId, actor) {
  await getApplicationForActor(profileId, actor);
  if (actor.role === 'vendor') throw domainError('You do not have access to audit history.', 'FORBIDDEN', 403);
  return AuditLog.find({ resourceId: profileId }).sort({ createdAt: 1 }).limit(200);
}
