import { describe, it, expect } from 'vitest';
import { compressLogs } from '@/shared/prefilter.js';
import type { LogSample } from '@/shared/logs.js';

function sample(message: string, logId = 'p1', timestamp = '2026-04-19T00:00:00Z'): LogSample {
  return { logId, timestamp, message };
}

describe('compressLogs', () => {
  it('extracts signal fields from pino JSON log', () => {
    const log = sample(
      JSON.stringify({
        level: 'error',
        time: '2026-04-19T00:00:00.000Z',
        chaos_type: 'http_5xx',
        status_code: 503,
        msg: 'Chaos: returning HTTP 5xx',
      }),
    );
    const result = compressLogs([log]);
    expect(result).toContain('[p1]');
    expect(result).toContain('chaos_type=http_5xx');
    expect(result).toContain('status_code=503');
    expect(result).toContain('Chaos: returning HTTP 5xx');
    expect(result).toContain('level=error');
  });

  it('keeps only first 2 lines of stack trace', () => {
    const stack = Array.from({ length: 10 }, (_, i) => `  at frame${i} (file.js:${i})`).join('\n');
    const log = sample(
      JSON.stringify({
        level: 'error',
        msg: 'boom',
        stack: `Error: boom\n${stack}`,
      }),
    );
    const result = compressLogs([log]);
    expect(result).toContain('Error: boom');
    expect(result).toContain('at frame0');
    expect(result).not.toContain('at frame3');
  });

  it('truncates long messages to 240 chars', () => {
    const longMsg = 'x'.repeat(400);
    const log = sample(JSON.stringify({ level: 'error', msg: longMsg }));
    const result = compressLogs([log]);
    const msgLine = result.split('\n').find((l) => l.includes('xxxxxx'));
    expect(msgLine).toBeDefined();
    expect(msgLine!.length).toBeLessThanOrEqual(300);
    expect(result).toContain('...');
  });

  it('redacts payload when pii_flag is true', () => {
    const log = sample(
      JSON.stringify({
        level: 'error',
        pii_flag: true,
        chaos_type: 'error_log_spike',
        msg: 'Synthetic error #1 credit_card=4242-4242-4242-4242',
      }),
    );
    const result = compressLogs([log]);
    expect(result).toContain('pii_flag=true');
    expect(result).toContain('chaos_type=error_log_spike');
    expect(result).not.toContain('4242-4242-4242-4242');
    expect(result).toContain('[redacted]');
  });

  it('falls back to raw message when not valid JSON', () => {
    const log = sample('just a plain string');
    const result = compressLogs([log]);
    expect(result).toContain('just a plain string');
    expect(result).toContain('[p1]');
  });

  it('joins multiple logs with newlines and preserves logId ordering', () => {
    const logs = [
      sample(JSON.stringify({ level: 'warn', msg: 'first' }), 'a'),
      sample(JSON.stringify({ level: 'error', msg: 'second' }), 'b'),
    ];
    const result = compressLogs(logs);
    const lines = result.split('\n');
    expect(lines[0]).toContain('[a]');
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('[b]');
    expect(lines[1]).toContain('second');
  });

  it('returns empty string for empty input', () => {
    expect(compressLogs([])).toBe('');
  });
});
