export type PolicyDecision =
  | { action: 'allow' }
  | { action: 'deny'; reason: string; rule: string };

export interface PolicyContext {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  path: string;
}

const FORBIDDEN_PATTERNS: { rule: string; pattern: RegExp }[] = [
  { rule: 'prompt-injection-override', pattern: /ignore\s+(all\s+)?previous\s+instructions/i },
  { rule: 'system-prompt-leak', pattern: /reveal\s+(your|the)\s+system\s+prompt/i },
  { rule: 'data-exfil-instruct', pattern: /exfiltrate|send.*secrets|leak.*credentials/i },
  { rule: 'tool-abuse-shell', pattern: /rm\s+-rf\s+\/|:\(\)\{\s*:\|:&\};:/ },
  { rule: 'unauthorized-model-switch', pattern: /switch\s+to\s+(gpt|claude-opus-5|gemini|llama)/i },
];

const ALLOWED_MODEL_IDS = new Set([
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-6',
  'anthropic.claude-opus-4-5-20251101-v1:0',
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-opus-4-5-20251101-v1:0',
]);

export function evaluate(ctx: PolicyContext): PolicyDecision {
  const body = ctx.body as Record<string, unknown> | undefined;
  const modelId = typeof body?.modelId === 'string' ? body.modelId : undefined;
  if (modelId && !ALLOWED_MODEL_IDS.has(modelId)) {
    return {
      action: 'deny',
      rule: 'unauthorized-model-id',
      reason: `modelId '${modelId}' is not in the allow list`,
    };
  }

  const serialized = JSON.stringify(body ?? '');
  for (const { rule, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(serialized)) {
      return { action: 'deny', rule, reason: `pattern '${rule}' matched request body` };
    }
  }

  return { action: 'allow' };
}
