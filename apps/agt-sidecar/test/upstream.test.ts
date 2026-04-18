import { describe, it, expect, vi } from 'vitest';
import { BedrockUpstream } from '@/upstream.js';

describe('BedrockUpstream', () => {
  it('posts JSON body to endpoint and parses JSON response', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ greeting: 'hi' }),
    }));
    const upstream = new BedrockUpstream({
      endpoint: 'https://bedrock.example.com/invoke',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await upstream.invoke({ prompt: 'hi' }, { 'content-type': 'application/json' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ greeting: 'hi' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bedrock.example.com/invoke',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('returns text body when content-type is not json', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 502,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'upstream error',
    }));
    const upstream = new BedrockUpstream({
      endpoint: 'https://bedrock.example.com/invoke',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await upstream.invoke({}, {});
    expect(result.status).toBe(502);
    expect(result.body).toBe('upstream error');
  });

  it('forwards authorization and x-amz-target headers when provided', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{}',
    }));
    const upstream = new BedrockUpstream({
      endpoint: 'https://bedrock.example.com/invoke',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await upstream.invoke(
      {},
      {
        'content-type': 'application/json',
        authorization: 'AWS4-HMAC-SHA256 ...',
        'x-amz-target': 'BedrockRuntime.Invoke',
      },
    );
    const call = fetchMock.mock.calls[0]!;
    const options = call[1] as { headers: Record<string, string> };
    expect(options.headers.authorization).toBe('AWS4-HMAC-SHA256 ...');
    expect(options.headers['x-amz-target']).toBe('BedrockRuntime.Invoke');
  });
});
