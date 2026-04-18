import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildApp, type UpstreamInvoker } from '@/app.js';

function makeUpstream(
  impl: (
    body: unknown,
    headers: Record<string, string>,
  ) => Promise<{ status: number; body: unknown }>,
): UpstreamInvoker {
  return { invoke: vi.fn(impl) };
}

describe('agt-sidecar app', () => {
  it('responds to /health', async () => {
    const app = buildApp(makeUpstream(async () => ({ status: 200, body: {} })));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('forwards allowed request to upstream', async () => {
    const upstream = makeUpstream(async () => ({ status: 200, body: { ok: true } }));
    const app = buildApp(upstream);
    const res = await request(app)
      .post('/v1/invoke')
      .send({
        modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        messages: [{ role: 'user', content: 'hello' }],
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(upstream.invoke).toHaveBeenCalledTimes(1);
  });

  it('denies disallowed model id with 403', async () => {
    const upstream = makeUpstream(async () => ({ status: 200, body: { ok: true } }));
    const app = buildApp(upstream);
    const res = await request(app)
      .post('/v1/invoke')
      .send({ modelId: 'disallowed.model', messages: [] });
    expect(res.status).toBe(403);
    expect(res.body.rule).toBe('unauthorized-model-id');
    expect(upstream.invoke).not.toHaveBeenCalled();
  });

  it('returns 502 on upstream failure', async () => {
    const upstream = makeUpstream(async () => {
      throw new Error('timeout');
    });
    const app = buildApp(upstream);
    const res = await request(app)
      .post('/v1/invoke')
      .send({ modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0', messages: [] });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('upstream_failure');
    expect(res.body.message).toBe('timeout');
  });

  it('returns 404 for unknown routes', async () => {
    const app = buildApp(makeUpstream(async () => ({ status: 200, body: {} })));
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});
