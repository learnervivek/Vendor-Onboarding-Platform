import { Router } from 'express';
import openapi from '../../openapi.json' with { type: 'json' };

const router = Router();
router.get('/openapi.json', (_request, response) => response.json(openapi));

export default router;
