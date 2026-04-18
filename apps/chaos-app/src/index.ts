import http from 'node:http';
import { buildApp, chaosKindToEndpoint } from '@/app.js';
import { logger } from '@/logger.js';
import { startRandomScheduler, type ChaosKind } from '@/chaos/scheduler.js';

const PORT = Number(process.env.PORT ?? 8080);
const RANDOM_SCHEDULER_ENABLED = process.env.RANDOM_SCHEDULER_ENABLED !== 'false';

const app = buildApp();
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'chaos-app listening');
  if (RANDOM_SCHEDULER_ENABLED) {
    startRandomScheduler((kind: ChaosKind) => {
      const endpoint = chaosKindToEndpoint(kind);
      const options = {
        hostname: '127.0.0.1',
        port: PORT,
        path: endpoint,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '2' },
      };
      const req = http.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          logger.info(
            { chaos_type: kind, status_code: res.statusCode },
            'Random scheduler triggered chaos',
          );
        });
      });
      req.on('error', (err) => {
        logger.error(
          { chaos_type: kind, err: err.message },
          'Self-call failed for random scheduler',
        );
      });
      req.write('{}');
      req.end();
    });
  }
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Received shutdown signal');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
