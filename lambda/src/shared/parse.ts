import type { Severity } from '@/shared/types.js';

export interface TriageJsonShape {
  severity: Severity;
  summary: string;
  relatedLogIds?: string[];
}

export interface InvestigationJsonShape {
  hypotheses: string[];
}

export interface RootCauseJsonShape {
  rootCause: string;
  suggestedActions: string[];
}

const VALID_SEVERITIES = new Set<Severity>(['P1', 'P2', 'P3']);

export function extractJsonObject(text: string): unknown {
  if (!text) throw new ParseError('empty response');
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1]!.trim() : text.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new ParseError(`no JSON object found in: ${candidate.slice(0, 120)}`);
  }
  const slice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ParseError(`JSON.parse failed: ${message}`);
  }
}

export function parseTriageJson(text: string): TriageJsonShape {
  const obj = extractJsonObject(text) as Record<string, unknown>;
  const severity = obj.severity;
  if (typeof severity !== 'string' || !VALID_SEVERITIES.has(severity as Severity)) {
    throw new ParseError(`invalid severity: ${String(severity)}`);
  }
  if (typeof obj.summary !== 'string' || obj.summary.length === 0) {
    throw new ParseError('missing or empty summary');
  }
  const related = Array.isArray(obj.relatedLogIds)
    ? obj.relatedLogIds.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    severity: severity as Severity,
    summary: obj.summary,
    relatedLogIds: related,
  };
}

export function parseInvestigationJson(text: string): InvestigationJsonShape {
  const obj = extractJsonObject(text) as Record<string, unknown>;
  const hypotheses = Array.isArray(obj.hypotheses)
    ? obj.hypotheses.filter((v): v is string => typeof v === 'string')
    : [];
  if (hypotheses.length === 0) {
    throw new ParseError('hypotheses array empty or missing');
  }
  return { hypotheses };
}

export function parseRootCauseJson(text: string): RootCauseJsonShape {
  const obj = extractJsonObject(text) as Record<string, unknown>;
  if (typeof obj.rootCause !== 'string' || obj.rootCause.length === 0) {
    throw new ParseError('missing rootCause');
  }
  const suggestedActions = Array.isArray(obj.suggestedActions)
    ? obj.suggestedActions.filter((v): v is string => typeof v === 'string')
    : [];
  return { rootCause: obj.rootCause, suggestedActions };
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
