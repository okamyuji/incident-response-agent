import { describe, it, expect, vi } from 'vitest';
import { handleInvestigate } from '@/investigate-sonnet/handler.js';

describe('handleInvestigate', () => {
  it('returns hypotheses array', async () => {
    const deps = {
      bedrock: {
        invoke: vi.fn(async () => ({
          text: '{"hypotheses":["db timeout","memory leak"]}',
          tokensInput: 800,
          tokensOutput: 120,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })),
      },
      logs: {
        fetchRecent: vi.fn(async () => [{ logId: 'l1', timestamp: 't', message: 'm1' }]),
      },
      modelId: 'us.anthropic.claude-sonnet-4-6-v1:0',
    };

    const out = await handleInvestigate(deps, {
      incidentId: '01HSRJ0TEST',
      triage: {
        incidentId: '01HSRJ0TEST',
        severity: 'P2',
        summary: 's',
        relatedLogIds: ['l1'],
        modelUsed: 'haiku',
        tokensInput: 0,
        tokensOutput: 0,
      },
      logGroupName: '/ecs/x',
    });

    expect(out.hypotheses).toEqual(['db timeout', 'memory leak']);
    expect(out.incidentId).toBe('01HSRJ0TEST');
    expect(out.modelUsed).toBe('us.anthropic.claude-sonnet-4-6-v1:0');
  });
});
