import type { Request, Response } from 'express';
import { logger } from '@/logger.js';

const ERROR_LINES = 50;
const PII_SAMPLES = [
  'user_email=alice@example.com',
  'credit_card=4242-4242-4242-4242',
  'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.test',
  'aws_secret=AKIAIOSFODNN7EXAMPLE',
];

export function triggerErrorLogSpike(req: Request, res: Response): void {
  const includePii = req.query.include_pii === 'true';
  const startedAt = Date.now();

  for (let i = 0; i < ERROR_LINES; i++) {
    const piiSnippet = includePii
      ? PII_SAMPLES[i % PII_SAMPLES.length]
      : 'no-pii';
    const err = new Error(`Synthetic error #${i} ${piiSnippet}`);
    logger.error(
      {
        chaos_type: 'error_log_spike',
        iteration: i,
        stack: err.stack,
        pii_flag: includePii,
      },
      `Synthetic error #${i}`,
    );
  }

  const durationMs = Date.now() - startedAt;
  res.status(200).json({
    message: 'Error log spike emitted',
    lines: ERROR_LINES,
    include_pii: includePii,
    duration_ms: durationMs,
  });
}
