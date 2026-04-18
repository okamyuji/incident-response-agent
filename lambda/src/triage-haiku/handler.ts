// ハマりポイント: Bedrock の応答は JSON 文字列を直接返しますが、モデルが時々
// ```json ... ``` のコードフェンスや先頭の解説を付けてきます。parseTriageJson は
// フェンス除去＋最初の {...} 抽出をするので、プロンプトで「JSON のみ返せ」と
// 指示しつつパーサ側でもゆるく拾う二段構え。相当 prompt を追い込まないと
// "ignore previous instructions" 等が混じって来るので Guardrails も併用します。
import { ulid } from 'ulid';
import { parseTriageJson } from '@/shared/parse.js';
import type { BedrockInvoker } from '@/shared/bedrock.js';
import type { LogFetcher } from '@/shared/logs.js';
import type { TriageInput, TriageOutput } from '@/shared/types.js';

export interface TriageDeps {
  bedrock: BedrockInvoker;
  logs: LogFetcher;
  modelId: string;
  guardrailId?: string;
  guardrailVersion?: string;
}

const SYSTEM_PROMPT = `You are a Site Reliability Engineer assistant performing initial triage of alarms.
Given the alarm metadata and recent error logs, respond with a JSON object of the form:
{"severity":"P1|P2|P3","summary":"<60 chars max>","relatedLogIds":["ptr1","ptr2"]}
- P1: customer-facing outage, data loss risk, or security incident
- P2: degraded service for a subset of users, or likely to escalate
- P3: informational or low-impact anomaly
Respond with ONLY the JSON object, no prose.`;

export async function handleTriage(deps: TriageDeps, input: TriageInput): Promise<TriageOutput> {
  const incidentId = ulid();
  const logs = await deps.logs.fetchRecent({
    logGroupName: input.logGroupName,
    minutes: 15,
    limit: 40,
  });

  const userPrompt = [
    `Alarm name: ${input.alarmName}`,
    `Reason: ${input.alarmReason}`,
    `Triggered at: ${input.triggeredAt}`,
    `Recent error logs:`,
    ...logs.map((l) => `- [${l.logId}] ${l.timestamp} ${l.message}`.slice(0, 500)),
  ].join('\n');

  const result = await deps.bedrock.invoke({
    modelId: deps.modelId,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 512,
    temperature: 0.1,
    guardrailId: deps.guardrailId,
    guardrailVersion: deps.guardrailVersion,
  });

  const parsed = parseTriageJson(result.text);
  const relatedLogIds =
    parsed.relatedLogIds && parsed.relatedLogIds.length > 0
      ? parsed.relatedLogIds
      : logs.slice(0, 10).map((l) => l.logId);
  return {
    incidentId,
    severity: parsed.severity,
    summary: parsed.summary,
    relatedLogIds,
    modelUsed: deps.modelId,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
  };
}
