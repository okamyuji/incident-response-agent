import type { Response } from 'express';
import { logger } from '@/logger.js';

const MIN_DELAY_MS = 3000;
const MAX_EXTRA_DELAY_MS = 5000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function triggerLatency(res: Response): Promise<void> {
  const delayMs = MIN_DELAY_MS + Math.floor(Math.random() * MAX_EXTRA_DELAY_MS);
  logger.warn({ chaos_type: 'latency_spike', delay_ms: delayMs }, 'Chaos: injecting latency spike');
  await sleep(delayMs);
  res.status(200).json({
    message: 'Response delayed intentionally',
    delay_ms: delayMs,
  });
}
