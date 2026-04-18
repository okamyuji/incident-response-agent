import { describe, it, expect, vi } from 'vitest';
import { handleRca } from '@/rca-opus/handler.js';

describe('handleRca', () => {
  it('returns rootCause, actions, and cache hits', async () => {
    const invokeMock = vi.fn(async () => ({
      text: '{"rootCause":"db connection pool exhausted","suggestedActions":["raise pool","add retries"]}',
      tokensInput: 5000,
      tokensOutput: 300,
      cacheReadTokens: 3500,
      cacheWriteTokens: 500,
    }));
    const deps = {
      bedrock: { invoke: invokeMock },
      logs: {
        fetchRecent: vi.fn(async () => []),
      },
      modelId: 'us.anthropic.claude-opus-4-5-v1:0',
    };

    const out = await handleRca(deps, {
      incidentId: 'X',
      triage: {
        incidentId: 'X',
        severity: 'P1',
        summary: 's',
        relatedLogIds: [],
        modelUsed: 'haiku',
        tokensInput: 0,
        tokensOutput: 0,
      },
      investigation: {
        incidentId: 'X',
        hypotheses: ['h1'],
        modelUsed: 'sonnet',
        tokensInput: 0,
        tokensOutput: 0,
      },
      logGroupName: '/ecs/x',
    });

    expect(out.rootCause).toBe('db connection pool exhausted');
    expect(out.suggestedActions).toEqual(['raise pool', 'add retries']);
    expect(out.cacheHits).toBe(3500);
    expect(invokeMock.mock.calls[0]![0].enablePromptCache).toBe(true);
  });
});
