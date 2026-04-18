import type { Response } from 'express';
import { logger } from '@/logger.js';

const BUFFER_SIZE_MB = 128;
const ALLOCATE_INTERVAL_MS = 50;
const leakedBuffers: Buffer[] = [];

export function triggerOom(res: Response): void {
  const testMode =
    process.env.NODE_ENV === 'test' || process.env.CHAOS_TEST_MODE === 'true';
  logger.error(
    { chaos_type: 'oom', test_mode: testMode },
    'Chaos: starting memory allocation to trigger OOM',
  );

  res.status(202).json({
    message: 'OOM sequence started, container will crash shortly',
    test_mode: testMode,
  });

  if (testMode) {
    return;
  }

  scheduleAllocations();
}

export function scheduleAllocations(): NodeJS.Timeout {
  const intervalId = setInterval(() => {
    try {
      const buffer = Buffer.alloc(BUFFER_SIZE_MB * 1024 * 1024);
      leakedBuffers.push(buffer);
      logger.warn(
        { chaos_type: 'oom', allocated_buffers: leakedBuffers.length },
        'Chaos OOM allocation in progress',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { chaos_type: 'oom', error: message },
        'Allocation failed',
      );
      clearInterval(intervalId);
      process.exit(137);
    }
  }, ALLOCATE_INTERVAL_MS);
  return intervalId;
}

export function resetLeakedBuffers(): void {
  leakedBuffers.length = 0;
}
