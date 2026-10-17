import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteDocument, getAuthorizedDocument, getOrCreateProfile, listDocuments, readPrivate, submitProfile, updateProfile, uploadDocument } from '../services/vendor-profile.js';
import { getApplicationDetails, listAuditHistory } from '../services/application-lifecycle.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, parts: 4, fieldSize: 1024 } });
const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  registrationNumber: z.string().trim().min(2).max(100),
  businessType: z.enum(['sole_proprietorship', 'partnership', 'corporation', 'nonprofit', 'other']),
  contact: z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), phone: z.string().trim().min(5).max(40) }),
  address: z.object({ line1: z.string().trim().min(2).max(200), line2: z.string().max(200).optional().default(''), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), postalCode: z.string().trim().min(2).max(30), country: z.string().trim().min(2).max(100) })
}).partial().strict();

router.use(requireAuth, requireRole('vendor'));
router.get('/profile', async (request, response, next) => { try { response.json({ data: { profile: await getOrCreateProfile(request.user.id) } }); } catch (error) { next(error); } });
router.patch('/profile', async (request, response, next) => { try { response.json({ data: { profile: await updateProfile(request.user.id, profileSchema.parse(request.body)) } }); } catch (error) { next(error); } });
router.post('/submit', async (request, response, next) => { try { response.json({ data: { profile: await submitProfile(request.user.id) } }); } catch (error) { next(error); } });
router.get('/applications/:profileId', async (request, response, next) => { try { response.json({ data: await getApplicationDetails(request.params.profileId, request.user) }); } catch (error) { next(error); } });
router.get('/applications/:profileId/audit', async (request, response, next) => { try { response.json({ data: { audit: await listAuditHistory(request.params.profileId, request.user) } }); } catch (error) { next(error); } });
router.get('/documents', async (request, response, next) => { try { response.json({ data: { documents: await listDocuments(request.user.id) } }); } catch (error) { next(error); } });
router.post('/documents', upload.single('file'), async (request, response, next) => { try { if (!request.file) throw Object.assign(new Error('A document file is required.'), { statusCode: 400, code: 'FILE_REQUIRED' }); const document = await uploadDocument(request.user.id, request.body.requirement, request.file); response.status(201).json({ data: { document } }); } catch (error) { next(error); } });
router.get('/documents/:documentId', async (request, response, next) => { try { const document = await getAuthorizedDocument(request.user.id, request.params.documentId); const file = await readPrivate(document.storageProvider, document.storageKey); if (file.redirect) return response.redirect(file.redirect); response.type(document.mimeType).send(file.buffer); } catch (error) { next(error); } });
router.delete('/documents/:documentId', async (request, response, next) => { try { await deleteDocument(request.user.id, request.params.documentId); response.status(204).end(); } catch (error) { next(error); } });

export default router;
