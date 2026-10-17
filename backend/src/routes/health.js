import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const healthy = database === 'connected';
  response.status(healthy ? 200 : 503).json({
    data: {
      status: healthy ? 'ok' : 'degraded',
      service: 'edvexa-api',
      database,
      timestamp: new Date().toISOString()
    }
  });
});

export default router;
