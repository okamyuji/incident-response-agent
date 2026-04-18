import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '@/logger.js';
import { evaluate } from '@/policy.js';

export interface UpstreamInvoker {
  invoke(body: unknown, headers: Record<string, string>): Promise<{ status: number; body: unknown }>;
}

export function buildApp(upstream: UpstreamInvoker): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'agt-sidecar' });
  });

  app.post('/v1/invoke', async (req: Request, res: Response) => {
    const decision = evaluate({
      body: req.body,
      headers: req.headers,
      path: req.path,
    });

    if (decision.action === 'deny') {
      logger.warn(
        { rule: decision.rule, reason: decision.reason, policy: 'deny' },
        'AGT sidecar denied request',
      );
      res.status(403).json({
        error: 'policy_denied',
        rule: decision.rule,
        reason: decision.reason,
      });
      return;
    }

    try {
      const headers = Object.fromEntries(
        Object.entries(req.headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const response = await upstream.invoke(req.body, headers);
      logger.info({ upstream_status: response.status, policy: 'allow' }, 'Forwarded to upstream');
      res.status(response.status).json(response.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, 'Upstream invocation failed');
      res.status(502).json({ error: 'upstream_failure', message });
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
