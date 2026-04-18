export type Severity = 'P1' | 'P2' | 'P3';

export interface TriageInput {
  alarmName: string;
  alarmReason: string;
  logGroupName: string;
  triggeredAt: string;
}

export interface TriageOutput {
  incidentId: string;
  severity: Severity;
  summary: string;
  relatedLogIds: string[];
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

export interface InvestigationInput {
  incidentId: string;
  triage: TriageOutput;
  logGroupName: string;
}

export interface InvestigationOutput {
  incidentId: string;
  hypotheses: string[];
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

export interface RootCauseInput {
  incidentId: string;
  triage: TriageOutput;
  investigation: InvestigationOutput;
  logGroupName: string;
}

export interface RootCauseOutput {
  incidentId: string;
  rootCause: string;
  suggestedActions: string[];
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  cacheHits: number;
}

export interface IncidentRecord {
  incident_id: string;
  created_at: string;
  severity: Severity;
  summary: string;
  hypotheses?: string[];
  root_cause?: string;
  suggested_actions?: string[];
  related_log_ids: string[];
  model_chain: string[];
  cost_usd: number;
  ttl: number;
}
