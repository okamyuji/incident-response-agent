import { RealBedrockInvoker } from '@/shared/bedrock.js';
import { CloudWatchLogFetcher } from '@/shared/logs.js';
import { handleTriage, type TriageDeps } from '@/triage-haiku/handler.js';
import type { TriageInput, TriageOutput } from '@/shared/types.js';

const MODEL_ID = process.env.HAIKU_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const GUARDRAIL_ID = process.env.GUARDRAIL_ID;
const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION;

const deps: TriageDeps = {
  bedrock: new RealBedrockInvoker(),
  logs: new CloudWatchLogFetcher(),
  modelId: MODEL_ID,
  guardrailId: GUARDRAIL_ID,
  guardrailVersion: GUARDRAIL_VERSION,
};

export const handler = async (event: TriageInput): Promise<TriageOutput> => {
  return handleTriage(deps, event);
};
