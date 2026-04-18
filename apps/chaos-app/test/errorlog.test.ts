import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/app.js';

describe('POST /chaos/errorlog', () => {
  it('emits 50 error log lines without PII by default', async () => {
    const app = buildApp();
    const res = await request(app).post('/chaos/errorlog');
    expect(res.status).toBe(200);
    expect(res.body.lines).toBe(50);
    expect(res.body.include_pii).toBe(false);
  });

  it('emits error log lines with PII when include_pii=true', async () => {
    const app = buildApp();
    const res = await request(app).post('/chaos/errorlog?include_pii=true');
    expect(res.status).toBe(200);
    expect(res.body.lines).toBe(50);
    expect(res.body.include_pii).toBe(true);
  });
});
