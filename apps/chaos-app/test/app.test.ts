import { describe, it, expect } from 'vitest';
import { chaosKindToEndpoint } from '@/app.js';

describe('chaosKindToEndpoint', () => {
  it('maps http_5xx to /chaos/http', () => {
    expect(chaosKindToEndpoint('http_5xx')).toBe('/chaos/http');
  });
  it('maps latency_spike to /chaos/latency', () => {
    expect(chaosKindToEndpoint('latency_spike')).toBe('/chaos/latency');
  });
  it('maps external_api_failure to /chaos/external', () => {
    expect(chaosKindToEndpoint('external_api_failure')).toBe('/chaos/external');
  });
  it('maps error_log_spike to /chaos/errorlog', () => {
    expect(chaosKindToEndpoint('error_log_spike')).toBe('/chaos/errorlog');
  });
});
