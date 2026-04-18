import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pickRandomChaos,
  nextDelayMs,
  CHAOS_KINDS,
  startRandomScheduler,
} from '@/chaos/scheduler.js';

describe('pickRandomChaos', () => {
  it('returns a valid chaos kind', () => {
    const kind = pickRandomChaos(() => 0.0);
    expect(CHAOS_KINDS).toContain(kind);
  });

  it('selects the first kind when rng returns 0', () => {
    expect(pickRandomChaos(() => 0)).toBe(CHAOS_KINDS[0]);
  });

  it('selects the last kind when rng returns value near 1', () => {
    expect(pickRandomChaos(() => 0.9999)).toBe(CHAOS_KINDS[CHAOS_KINDS.length - 1]);
  });
});

describe('nextDelayMs', () => {
  it('returns delay >= 5 minutes', () => {
    expect(nextDelayMs(() => 0)).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
  it('returns delay <= 10 minutes', () => {
    expect(nextDelayMs(() => 0.9999)).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe('startRandomScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a chaos kind after scheduled delay', () => {
    const emit = vi.fn();
    startRandomScheduler(emit, () => 0);
    vi.advanceTimersByTime(5 * 60 * 1000 + 10);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(CHAOS_KINDS).toContain(emit.mock.calls[0]![0]);
  });

  it('continues emitting on subsequent intervals', () => {
    const emit = vi.fn();
    startRandomScheduler(emit, () => 0);
    vi.advanceTimersByTime(5 * 60 * 1000 + 10);
    vi.advanceTimersByTime(5 * 60 * 1000 + 10);
    expect(emit.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('swallows emit errors without crashing', () => {
    const emit = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => {
      startRandomScheduler(emit, () => 0);
      vi.advanceTimersByTime(5 * 60 * 1000 + 10);
    }).not.toThrow();
  });
});
