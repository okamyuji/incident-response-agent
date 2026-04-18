import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';
import { resetLeakedBuffers } from '@/chaos/oom.js';

describe('POST /chaos/oom in test mode', () => {
  beforeEach(() => {
    process.env.CHAOS_TEST_MODE = 'true';
    resetLeakedBuffers();
  });
  afterEach(() => {
    delete process.env.CHAOS_TEST_MODE;
  });

  it('returns 202 and does NOT allocate memory or exit in test mode', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const app = buildApp();
    const res = await request(app).post('/chaos/oom');
    expect(res.status).toBe(202);
    expect(res.body.test_mode).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
