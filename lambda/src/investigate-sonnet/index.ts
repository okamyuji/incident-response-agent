import { RealBedrockInvoker } from '@/shared/bedrock.js';
import { CloudWatchLogFetcher } from '@/shared/logs.js';
import { handleInvestigate, type InvestigateDeps } from '@/investigate-sonnet/handler.js';
import type { InvestigationInput, InvestigationOutput } from '@/shared/types.js';

const MODEL_ID = process.env.SONNET_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

const deps: InvestigateDeps = {
  bedrock: new RealBedrockInvoker(),
  logs: new CloudWatchLogFetcher(),
  modelId: MODEL_ID,
  guardrailId: process.env.GUARDRAIL_ID,
  guardrailVersion: process.env.GUARDRAIL_VERSION,
};

export const handler = async (event: InvestigationInput): Promise<InvestigationOutput> => {
  return handleInvestigate(deps, event);
};
