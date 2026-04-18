import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '@/logger.js';
import { triggerHttpError } from '@/chaos/http.js';
import { triggerLatency } from '@/chaos/latency.js';
import { triggerOom } from '@/chaos/oom.js';
import { triggerExternalFailure } from '@/chaos/external.js';
import { triggerErrorLogSpike } from '@/chaos/errorlog.js';
import { triggerP1Outage } from '@/chaos/p1.js';
import type { ChaosKind } from '@/chaos/scheduler.js';

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'chaos-app' });
  });

  app.post('/chaos/http', (_req: Request, res: Response) => {
    triggerHttpError(res);
  });

  app.post('/chaos/latency', async (_req: Request, res: Response) => {
    await triggerLatency(res);
  });

  app.post('/chaos/oom', (_req: Request, res: Response) => {
    triggerOom(res);
  });

  app.post('/chaos/external', async (_req: Request, res: Response) => {
    await triggerExternalFailure(res);
  });

  app.post('/chaos/errorlog', (req: Request, res: Response) => {
    triggerErrorLogSpike(req, res);
  });

  app.post('/chaos/p1', (_req: Request, res: Response) => {
    triggerP1Outage(res);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

export function chaosKindToEndpoint(kind: ChaosKind): string {
  switch (kind) {
    case 'http_5xx':
      return '/chaos/http';
    case 'latency_spike':
      return '/chaos/latency';
    case 'external_api_failure':
      return '/chaos/external';
    case 'error_log_spike':
      return '/chaos/errorlog';
  }
}
