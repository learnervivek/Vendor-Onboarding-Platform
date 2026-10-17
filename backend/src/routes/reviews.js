import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { claimApplication, getApplicationDetails, getAuthorizedDocumentForActor, listApplications, listAuditHistory, transitionApplication } from '../services/application-lifecycle.js';
import { readPrivate } from '../services/vendor-profile.js';
import { parseListQuery } from '../utils/query.js';

const router = Router();
const decision = z.object({ reason: z.string().trim().min(3).max(2000) }).strict();

router.use(requireAuth, requireRole('reviewer'));
router.get('/', async (request, response, next) => { try { response.json({ data: await listApplications({ $or: [{ assignedReviewerId: request.user.id }, { assignedReviewerId: null }], status: { $in: ['submitted', 'under_review'] } }, parseListQuery(request.query)) }); } catch (error) { next(error); } });
router.get('/:profileId', async (request, response, next) => { try { response.json({ data: await getApplicationDetails(request.params.profileId, request.user) }); } catch (error) { next(error); } });
router.post('/:profileId/claim', async (request, response, next) => { try { response.json({ data: { profile: await claimApplication({ profileId: request.params.profileId, reviewer: request.user }) } }); } catch (error) { next(error); } });
router.post('/:profileId/approve', async (request, response, next) => { try { const { reason } = decision.parse(request.body); response.json({ data: { profile: await transitionApplication({ profileId: request.params.profileId, actor: request.user, toStatus: 'approved', reason }) } }); } catch (error) { next(error); } });
router.post('/:profileId/reject', async (request, response, next) => { try { const { reason } = decision.parse(request.body); response.json({ data: { profile: await transitionApplication({ profileId: request.params.profileId, actor: request.user, toStatus: 'rejected', reason }) } }); } catch (error) { next(error); } });
router.get('/:profileId/audit', async (request, response, next) => { try { response.json({ data: { audit: await listAuditHistory(request.params.profileId, request.user) } }); } catch (error) { next(error); } });
router.get('/:profileId/documents/:documentId', async (request, response, next) => { try { const document = await getAuthorizedDocumentForActor(request.params.profileId, request.params.documentId, request.user); const file = await readPrivate(document.storageProvider, document.storageKey); if (file.redirect) return response.redirect(file.redirect); response.type(document.mimeType).send(file.buffer); } catch (error) { next(error); } });

export default router;
