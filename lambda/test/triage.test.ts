import { describe, it, expect, vi } from 'vitest';
import { handleTriage } from '@/triage-haiku/handler.js';
import type { BedrockInvoker } from '@/shared/bedrock.js';
import type { LogFetcher } from '@/shared/logs.js';

function makeDeps(overrides?: {
  text?: string;
  logs?: Array<{ logId: string; timestamp: string; message: string }>;
}): {
  bedrock: BedrockInvoker;
  logs: LogFetcher;
  modelId: string;
} {
  return {
    bedrock: {
      invoke: vi.fn(async () => ({
        text:
          overrides?.text ??
          '{"severity":"P2","summary":"HTTP 5xx spike","relatedLogIds":["ptr1"]}',
        tokensInput: 400,
        tokensOutput: 30,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })),
    },
    logs: {
      fetchRecent: vi.fn(
        async () => overrides?.logs ?? [{ logId: 'ptr1', timestamp: 't1', message: 'error x' }],
      ),
    },
    modelId: 'us.anthropic.claude-haiku-4-5-v1:0',
  };
}

describe('handleTriage', () => {
  it('returns severity, summary, incidentId', async () => {
    const deps = makeDeps();
    const out = await handleTriage(deps, {
      alarmName: 'test-alarm',
      alarmReason: 'threshold breached',
      logGroupName: '/ecs/chaos-app',
      triggeredAt: '2026-04-18T09:00:00Z',
    });
    expect(out.severity).toBe('P2');
    expect(out.summary).toBe('HTTP 5xx spike');
    expect(out.incidentId).toMatch(/^[0-9A-Z]{26}$/);
    expect(out.modelUsed).toBe('us.anthropic.claude-haiku-4-5-v1:0');
    expect(out.relatedLogIds).toEqual(['ptr1']);
  });

  it('falls back to fetched logs when relatedLogIds absent', async () => {
    const deps = makeDeps({
      text: '{"severity":"P3","summary":"minor"}',
      logs: [
        { logId: 'l1', timestamp: 't', message: 'm1' },
        { logId: 'l2', timestamp: 't', message: 'm2' },
      ],
    });
    const out = await handleTriage(deps, {
      alarmName: 'a',
      alarmReason: 'r',
      logGroupName: '/ecs/x',
      triggeredAt: 't',
    });
    expect(out.relatedLogIds).toEqual(['l1', 'l2']);
  });

  it('propagates parse error when Bedrock returns invalid JSON', async () => {
    const deps = makeDeps({ text: 'not json at all' });
    await expect(
      handleTriage(deps, {
        alarmName: 'a',
        alarmReason: 'r',
        logGroupName: '/ecs/x',
        triggeredAt: 't',
      }),
    ).rejects.toThrow();
  });
});
