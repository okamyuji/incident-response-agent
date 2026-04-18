// Haiku 入力のトークン削減用プリフィルター。
// pino の JSON ログを受け取り、SRE トリアージに必要なキーのみを抽出した 1 行形式に圧縮する。
// CloudWatch Logs Data Protection で PII は既にマスクされるが、多重防御として
// pii_flag=true のログは msg 本文を [redacted] に置換する。
import type { LogSample } from './logs.js';

const MAX_MSG_LEN = 240;
const STACK_HEAD_LINES = 3; // "Error: ..." + 先頭 2 フレーム

const SIGNAL_KEYS = [
  'level',
  'chaos_type',
  'status_code',
  'delay_ms',
  'test_mode',
  'error_name',
  'error_message',
  'pii_flag',
  'target',
  'duration_ms',
  'iteration',
] as const;

interface PinoLog {
  [k: string]: unknown;
  level?: unknown;
  msg?: unknown;
  stack?: unknown;
  pii_flag?: unknown;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}

function trimStack(stack: string): string {
  const lines = stack.split('\n');
  return lines.slice(0, STACK_HEAD_LINES).join(' | ');
}

function parseJson(raw: string): PinoLog | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as PinoLog) : null;
  } catch {
    return null;
  }
}

function compressOne(sample: LogSample): string {
  const parsed = parseJson(sample.message);
  if (!parsed) {
    return `[${sample.logId}] ${truncate(sample.message, MAX_MSG_LEN)}`;
  }

  const piiFlag = parsed.pii_flag === true;
  const parts: string[] = [];

  for (const key of SIGNAL_KEYS) {
    const value = parsed[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}=${String(value)}`);
  }

  const rawMsg = typeof parsed.msg === 'string' ? parsed.msg : '';
  const safeMsg = piiFlag ? '[redacted]' : truncate(rawMsg, MAX_MSG_LEN);
  if (safeMsg) parts.push(`msg=${safeMsg}`);

  if (typeof parsed.stack === 'string' && parsed.stack) {
    parts.push(`stack=${trimStack(parsed.stack)}`);
  }

  return `[${sample.logId}] ${parts.join(' ')}`;
}

export function compressLogs(logs: LogSample[]): string {
  return logs.map(compressOne).join('\n');
}
