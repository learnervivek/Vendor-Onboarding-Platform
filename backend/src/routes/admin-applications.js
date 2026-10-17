import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getApplicationDetails, getAuthorizedDocumentForActor, listApplications, listAuditHistory } from '../services/application-lifecycle.js';
import { readPrivate } from '../services/vendor-profile.js';
import { parseListQuery } from '../utils/query.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', async (request, response, next) => { try { response.json({ data: await listApplications({}, parseListQuery(request.query)) }); } catch (error) { next(error); } });
router.get('/:profileId', async (request, response, next) => { try { response.json({ data: await getApplicationDetails(request.params.profileId, request.user) }); } catch (error) { next(error); } });
router.get('/:profileId/audit', async (request, response, next) => { try { response.json({ data: { audit: await listAuditHistory(request.params.profileId, request.user) } }); } catch (error) { next(error); } });
router.get('/:profileId/documents/:documentId', async (request, response, next) => { try { const document = await getAuthorizedDocumentForActor(request.params.profileId, request.params.documentId, request.user); const file = await readPrivate(document.storageProvider, document.storageKey); if (file.redirect) return response.redirect(file.redirect); response.type(document.mimeType).send(file.buffer); } catch (error) { next(error); } });

export default router;
