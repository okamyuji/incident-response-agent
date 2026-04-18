import type { UpstreamInvoker } from '@/app.js';
import { logger } from '@/logger.js';

export interface BedrockUpstreamConfig {
  endpoint: string;
  fetchImpl?: typeof fetch;
}

export class BedrockUpstream implements UpstreamInvoker {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BedrockUpstreamConfig) {
    this.endpoint = config.endpoint;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async invoke(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const safeHeaders: Record<string, string> = {
      'content-type': headers['content-type'] ?? 'application/json',
    };
    if (headers['x-amz-target']) safeHeaders['x-amz-target'] = headers['x-amz-target'];
    if (headers['authorization']) safeHeaders['authorization'] = headers['authorization'];

    const startedAt = Date.now();
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const parsed = contentType.includes('json') && text ? (JSON.parse(text) as unknown) : text;

    logger.info(
      {
        upstream: 'bedrock',
        status: response.status,
        duration_ms: Date.now() - startedAt,
      },
      'Upstream call complete',
    );

    return { status: response.status, body: parsed };
  }
}
