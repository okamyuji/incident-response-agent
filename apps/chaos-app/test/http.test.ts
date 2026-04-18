import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';

describe('POST /chaos/http', () => {
  it('returns an HTTP 5xx status code', async () => {
    const app = buildApp();
    const res = await request(app).post('/chaos/http');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(504);
    expect(res.body.error).toBe('chaos_http_5xx');
  });
});

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Unknown route', () => {
  it('returns 404', async () => {
    const app = buildApp();
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
