import { parseRootCauseJson } from '@/shared/parse.js';
import type { BedrockInvoker } from '@/shared/bedrock.js';
import type { LogFetcher } from '@/shared/logs.js';
import type { RootCauseInput, RootCauseOutput } from '@/shared/types.js';

export interface RcaDeps {
  bedrock: BedrockInvoker;
  logs: LogFetcher;
  modelId: string;
  guardrailId?: string;
  guardrailVersion?: string;
}

const SYSTEM_PROMPT = `You are a principal SRE performing deep root cause analysis of a P1 incident.
Use the triage, investigation hypotheses, and logs to determine the single most likely root cause
and concrete remediation actions. Respond ONLY with JSON:
{"rootCause":"...","suggestedActions":["action 1","action 2"]}`;

export async function handleRca(deps: RcaDeps, input: RootCauseInput): Promise<RootCauseOutput> {
  const logs = await deps.logs.fetchRecent({
    logGroupName: input.logGroupName,
    minutes: 60,
    limit: 120,
  });

  const userPrompt = [
    `Incident ID: ${input.incidentId}`,
    `Triage: ${JSON.stringify(input.triage)}`,
    `Investigation hypotheses: ${input.investigation.hypotheses.join(' | ')}`,
    `Recent logs:`,
    ...logs.slice(0, 80).map((l) => `- ${l.timestamp} ${l.message}`.slice(0, 500)),
  ].join('\n');

  const result = await deps.bedrock.invoke({
    modelId: deps.modelId,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
    temperature: 0.1,
    enablePromptCache: true,
    guardrailId: deps.guardrailId,
    guardrailVersion: deps.guardrailVersion,
  });

  const parsed = parseRootCauseJson(result.text);
  return {
    incidentId: input.incidentId,
    rootCause: parsed.rootCause,
    suggestedActions: parsed.suggestedActions,
    modelUsed: deps.modelId,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    cacheHits: result.cacheReadTokens,
  };
}
