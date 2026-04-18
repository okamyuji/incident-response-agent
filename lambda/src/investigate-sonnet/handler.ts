import { parseInvestigationJson } from '@/shared/parse.js';
import type { BedrockInvoker } from '@/shared/bedrock.js';
import type { LogFetcher } from '@/shared/logs.js';
import type { InvestigationInput, InvestigationOutput } from '@/shared/types.js';

export interface InvestigateDeps {
  bedrock: BedrockInvoker;
  logs: LogFetcher;
  modelId: string;
  guardrailId?: string;
  guardrailVersion?: string;
}

const SYSTEM_PROMPT = `あなたはシニア SRE です。トリアージ結果と直近のエラーログを元に、
根本原因として考えられる仮説を最大 3 件まで、日本語で具体的に列挙してください。
技術用語（chaos_type、IAM、CloudWatch などのサービス名やフィールド名）は英語のままで OK です。
以下の JSON のみ返し、前後に説明文を付けないでください。

{"hypotheses":["仮説 1","仮説 2"]}`;

export async function handleInvestigate(
  deps: InvestigateDeps,
  input: InvestigationInput,
): Promise<InvestigationOutput> {
  const logs = await deps.logs.fetchRecent({
    logGroupName: input.logGroupName,
    minutes: 30,
    limit: 80,
  });

  const userPrompt = [
    `Incident ID: ${input.incidentId}`,
    `Triage summary: ${input.triage.summary}`,
    `Triage severity: ${input.triage.severity}`,
    `Related log IDs: ${input.triage.relatedLogIds.join(', ')}`,
    `Recent logs (most recent first):`,
    ...logs.slice(0, 50).map((l) => `- ${l.timestamp} ${l.message}`.slice(0, 500)),
  ].join('\n');

  const result = await deps.bedrock.invoke({
    modelId: deps.modelId,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.2,
    guardrailId: deps.guardrailId,
    guardrailVersion: deps.guardrailVersion,
  });

  const parsed = parseInvestigationJson(result.text);
  return {
    incidentId: input.incidentId,
    hypotheses: parsed.hypotheses,
    modelUsed: deps.modelId,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
  };
}
