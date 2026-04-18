import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';

describe('POST /chaos/external', () => {
  it('returns 502 when the unresolvable host fails', async () => {
    const app = buildApp();
    const res = await request(app).post('/chaos/external');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('external_api_failure');
    expect(res.body.error_message).toBeTruthy();
    expect(res.body.duration_ms).toBeGreaterThanOrEqual(0);
  }, 15000);
});
