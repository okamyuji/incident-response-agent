import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';

describe('POST /chaos/p1', () => {
  const originalEnv = process.env.CHAOS_TEST_MODE;
  beforeAll(() => {
    process.env.CHAOS_TEST_MODE = 'true';
  });
  afterAll(() => {
    process.env.CHAOS_TEST_MODE = originalEnv;
  });

  it('returns 503 with P1 severity hint payload', async () => {
    const app = buildApp();
    const res = await request(app).post('/chaos/p1');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('chaos_p1_outage');
    expect(res.body.severity_hint).toBe('P1');
    expect(res.body.incident_kind).toMatch(/outage|data_loss|security/);
  });

  it('returns one of outage/data_loss/security scenarios', async () => {
    const app = buildApp();
    const kinds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const res = await request(app).post('/chaos/p1');
      kinds.add(res.body.incident_kind);
    }
    for (const kind of kinds) {
      expect(['outage', 'data_loss', 'security']).toContain(kind);
    }
  });
});
