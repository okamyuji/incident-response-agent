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

const SYSTEM_PROMPT = `あなたはプリンシパル SRE で、P1 インシデントの深掘り根本原因分析を担当します。
トリアージ結果、investigate フェーズで提示された仮説、ログ群を総合して、最も可能性の高い
単一の根本原因と、具体的な復旧・再発防止アクションを日本語で示してください。
技術用語（AWS サービス名、log フィールド、ECS や Lambda など）は英語のままで OK です。
以下の JSON のみ返し、前後に説明文を付けないでください。

{"rootCause":"日本語の根本原因説明","suggestedActions":["アクション 1","アクション 2"]}`;

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
