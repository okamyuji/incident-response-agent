import type { Response } from 'express';
import { logger } from '@/logger.js';

const UNRESOLVABLE_HOST = 'this-host-does-not-exist-for-chaos-validation.invalid';

export async function triggerExternalFailure(res: Response): Promise<void> {
  const url = `https://${UNRESOLVABLE_HOST}/api/health`;
  logger.warn(
    { chaos_type: 'external_api_failure', target: url },
    'Chaos: calling unresolvable external host',
  );

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    logger.error(
      { chaos_type: 'external_api_failure' },
      'External host unexpectedly resolved - chaos scenario inconsistent',
    );
    res.status(500).json({ error: 'unexpected_success' });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const errorName = err instanceof Error ? err.name : 'UnknownError';
    logger.error(
      {
        chaos_type: 'external_api_failure',
        target: url,
        error_name: errorName,
        error_message: message,
        duration_ms: durationMs,
      },
      'Chaos: external API call failed as expected',
    );
    res.status(502).json({
      error: 'external_api_failure',
      error_name: errorName,
      error_message: message,
      duration_ms: durationMs,
    });
  }
}
