import type { Response } from 'express';
import { logger } from '@/logger.js';

// P1 誘発エンドポイント。
// 顧客影響・データ損失・セキュリティ のうちランダムな 1 種を選び、
// Triage Haiku が P1 と判定しやすい log 本文と、CloudWatch Metric Filter で
// 即時検知するための severity_hint=P1 を同時に吐き出す。
const P1_SCENARIOS = [
  {
    kind: 'outage',
    msg: 'Customer-facing outage: 100% of /checkout requests returning 503 across all AZ',
  },
  {
    kind: 'data_loss',
    msg: 'Primary database write replica lost quorum; last successful commit 47s ago',
  },
  {
    kind: 'security',
    msg: 'Security incident: unauthorized IAM role assumption detected from unknown principal',
  },
] as const;

export function triggerP1Outage(res: Response): void {
  const scenario = P1_SCENARIOS[Math.floor(Math.random() * P1_SCENARIOS.length)]!;

  logger.error(
    {
      chaos_type: 'p1_outage',
      severity_hint: 'P1',
      incident_kind: scenario.kind,
    },
    scenario.msg,
  );

  res.status(503).json({
    error: 'chaos_p1_outage',
    severity_hint: 'P1',
    incident_kind: scenario.kind,
    message: scenario.msg,
  });
}
