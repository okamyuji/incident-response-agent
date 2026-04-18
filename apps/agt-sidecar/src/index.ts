import { buildApp } from '@/app.js';
import { BedrockUpstream } from '@/upstream.js';
import { logger } from '@/logger.js';

const PORT = Number(process.env.PORT ?? 8081);
const UPSTREAM_ENDPOINT =
  process.env.UPSTREAM_ENDPOINT ?? 'https://bedrock-runtime.us-east-1.amazonaws.com/';

const upstream = new BedrockUpstream({ endpoint: UPSTREAM_ENDPOINT });
const app = buildApp(upstream);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, upstream: UPSTREAM_ENDPOINT }, 'agt-sidecar listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Received shutdown signal');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
