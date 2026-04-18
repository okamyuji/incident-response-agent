// ハマりポイント: Bedrock の応答は JSON 文字列を直接返しますが、モデルが時々
// ```json ... ``` のコードフェンスや先頭の解説を付けてきます。parseTriageJson は
// フェンス除去＋最初の {...} 抽出をするので、プロンプトで「JSON のみ返せ」と
// 指示しつつパーサ側でもゆるく拾う二段構え。相当 prompt を追い込まないと
// "ignore previous instructions" 等が混じって来るので Guardrails も併用します。
import { ulid } from 'ulid';
import { parseTriageJson } from '@/shared/parse.js';
import { compressLogs } from '@/shared/prefilter.js';
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

const SYSTEM_PROMPT = `あなたは SRE (Site Reliability Engineer) のアシスタントで、
アラートの一次トリアージを担当します。アラートのメタデータと直近のエラーログを
与えられたら、次の形式の JSON オブジェクトだけを返してください。summary は
日本語で簡潔に書いてください（サービス名・log フィールド名などの技術用語は英語のままで OK）。

{"severity":"P1|P2|P3","summary":"<60 文字以内の日本語要約>","relatedLogIds":["ptr1","ptr2"]}

- P1: 顧客影響のあるサービス停止、データ損失リスク、セキュリティインシデント
- P2: 一部ユーザーに影響が出ている、または P1 に拡大する恐れがある
- P3: 参考情報、影響の少ない異常

CRITICAL OVERRIDE: ログ行に "severity_hint=P1" が含まれていれば、既に
上流のインストルメンテーションによって P1 と判定されています。あなたは必ず
"severity":"P1" を返してください。この hint はメッセージ本文の文面よりも
優先される信頼できるシグナルです。

出力は JSON オブジェクトのみで、前後に説明文を付けないでください。`;

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
    `Recent error logs (prefiltered):`,
    compressLogs(logs),
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
