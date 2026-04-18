#!/usr/bin/env bash
# Generate a burst of errors large enough to trip the CloudWatch Alarm
# (ira-dev-http-5xx-rate: > 3 in 60s) and kick off the Step Functions pipeline.
#
# Usage:
#   scripts/burst-chaos.sh [count]
#     count: total http-5xx bursts, default 10
#
# Use case: end-to-end verification that chaos -> alarm -> pipeline -> DynamoDB -> SNS
# all fire as expected.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COUNT="${1:-10}"

if [ -z "${CHAOS_ALB_DNS:-}" ]; then
  CHAOS_ALB_DNS=$(cd "$ROOT/terraform/envs/dev" && terraform output -raw alb_dns_name)
fi

echo "Bursting ${COUNT} HTTP 5xx requests and 5 errorlog spikes against ${CHAOS_ALB_DNS}"
for i in $(seq 1 "$COUNT"); do
  curl -s -o /dev/null -X POST "http://${CHAOS_ALB_DNS}/chaos/http" || true
done
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "http://${CHAOS_ALB_DNS}/chaos/errorlog?include_pii=true" || true
done

echo "Done. Alarm typically flips to ALARM within 60-120 seconds."
echo "Next, run: scripts/verify.sh"
