import { RealBedrockInvoker } from '@/shared/bedrock.js';
import { CloudWatchLogFetcher } from '@/shared/logs.js';
import { handleRca, type RcaDeps } from '@/rca-opus/handler.js';
import type { RootCauseInput, RootCauseOutput } from '@/shared/types.js';

const MODEL_ID = process.env.OPUS_MODEL_ID ?? 'us.anthropic.claude-opus-4-5-20251101-v1:0';

const deps: RcaDeps = {
  bedrock: new RealBedrockInvoker(),
  logs: new CloudWatchLogFetcher(),
  modelId: MODEL_ID,
  guardrailId: process.env.GUARDRAIL_ID,
  guardrailVersion: process.env.GUARDRAIL_VERSION,
};

export const handler = async (event: RootCauseInput): Promise<RootCauseOutput> => {
  return handleRca(deps, event);
};
