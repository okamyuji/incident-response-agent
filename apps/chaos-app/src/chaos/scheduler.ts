import { logger } from '@/logger.js';

export type ChaosKind = 'http_5xx' | 'latency_spike' | 'external_api_failure' | 'error_log_spike';

export const CHAOS_KINDS: ChaosKind[] = [
  'http_5xx',
  'latency_spike',
  'external_api_failure',
  'error_log_spike',
];

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_EXTRA_INTERVAL_MS = 5 * 60 * 1000;

export function pickRandomChaos(rng: () => number = Math.random): ChaosKind {
  const index = Math.floor(rng() * CHAOS_KINDS.length);
  return CHAOS_KINDS[index]!;
}

export function nextDelayMs(rng: () => number = Math.random): number {
  return MIN_INTERVAL_MS + Math.floor(rng() * MAX_EXTRA_INTERVAL_MS);
}

export function startRandomScheduler(
  emit: (kind: ChaosKind) => void,
  rng: () => number = Math.random,
): NodeJS.Timeout {
  const schedule = (): NodeJS.Timeout => {
    const delay = nextDelayMs(rng);
    return setTimeout(() => {
      const kind = pickRandomChaos(rng);
      logger.info(
        { chaos_type: kind, scheduler: 'random' },
        'Random scheduler emitting chaos event',
      );
      try {
        emit(kind);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Random scheduler emit failed');
      }
      schedule();
    }, delay);
  };
  return schedule();
}
