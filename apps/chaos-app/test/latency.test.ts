import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';
import { sleep } from '@/chaos/latency.js';

describe('POST /chaos/latency', () => {
  it('delays the response by at least 3 seconds', async () => {
    const app = buildApp();
    const startedAt = Date.now();
    const res = await request(app).post('/chaos/latency');
    const durationMs = Date.now() - startedAt;
    expect(res.status).toBe(200);
    expect(res.body.delay_ms).toBeGreaterThanOrEqual(3000);
    expect(durationMs).toBeGreaterThanOrEqual(3000);
  }, 15000);
});

describe('sleep()', () => {
  it('resolves after roughly the requested ms', async () => {
    const started = Date.now();
    await sleep(50);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
