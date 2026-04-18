import { describe, it, expect } from 'vitest';
import {
  extractJsonObject,
  parseTriageJson,
  parseInvestigationJson,
  parseRootCauseJson,
  ParseError,
} from '@/shared/parse.js';

describe('extractJsonObject', () => {
  it('extracts JSON from fenced code block', () => {
    const obj = extractJsonObject('```json\n{"a":1}\n```') as { a: number };
    expect(obj.a).toBe(1);
  });

  it('extracts JSON object from prose', () => {
    const obj = extractJsonObject('Here it is: {"b":"x"} trailing') as { b: string };
    expect(obj.b).toBe('x');
  });

  it('throws on empty text', () => {
    expect(() => extractJsonObject('')).toThrow(ParseError);
  });

  it('throws when no braces present', () => {
    expect(() => extractJsonObject('no json here')).toThrow(ParseError);
  });

  it('throws on invalid JSON', () => {
    expect(() => extractJsonObject('{ not valid }')).toThrow(ParseError);
  });
});

describe('parseTriageJson', () => {
  it('parses valid triage JSON', () => {
    const out = parseTriageJson('{"severity":"P2","summary":"degraded","relatedLogIds":["a"]}');
    expect(out.severity).toBe('P2');
    expect(out.summary).toBe('degraded');
    expect(out.relatedLogIds).toEqual(['a']);
  });

  it('rejects invalid severity', () => {
    expect(() => parseTriageJson('{"severity":"X","summary":"x"}')).toThrow(ParseError);
  });

  it('rejects missing summary', () => {
    expect(() => parseTriageJson('{"severity":"P1","summary":""}')).toThrow(ParseError);
  });

  it('fills empty relatedLogIds when missing', () => {
    const out = parseTriageJson('{"severity":"P3","summary":"ok"}');
    expect(out.relatedLogIds).toEqual([]);
  });
});

describe('parseInvestigationJson', () => {
  it('parses hypotheses array', () => {
    const out = parseInvestigationJson('{"hypotheses":["a","b"]}');
    expect(out.hypotheses).toEqual(['a', 'b']);
  });

  it('rejects empty hypotheses', () => {
    expect(() => parseInvestigationJson('{"hypotheses":[]}')).toThrow(ParseError);
  });

  it('rejects missing hypotheses', () => {
    expect(() => parseInvestigationJson('{}')).toThrow(ParseError);
  });
});

describe('parseRootCauseJson', () => {
  it('parses rootCause and suggestedActions', () => {
    const out = parseRootCauseJson(
      '{"rootCause":"db timeout","suggestedActions":["increase pool"]}',
    );
    expect(out.rootCause).toBe('db timeout');
    expect(out.suggestedActions).toEqual(['increase pool']);
  });

  it('rejects missing rootCause', () => {
    expect(() => parseRootCauseJson('{"suggestedActions":["x"]}')).toThrow(ParseError);
  });

  it('defaults suggestedActions to empty array when missing', () => {
    const out = parseRootCauseJson('{"rootCause":"x"}');
    expect(out.suggestedActions).toEqual([]);
  });
});
