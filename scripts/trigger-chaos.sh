#!/usr/bin/env bash
# Trigger a single chaos type on the deployed chaos-app.
#
# Usage:
#   scripts/trigger-chaos.sh <kind> [count]
#
#   kind:  http | latency | oom | external | errorlog | all
#          alias "all" cycles http, latency, external, errorlog once each;
#          oom is NOT included in "all" because it crashes the container
#   count: optional, number of repetitions (default 1)
#
# Examples:
#   scripts/trigger-chaos.sh http           # one 5xx error
#   scripts/trigger-chaos.sh http 10        # ten 5xx errors in sequence
#   scripts/trigger-chaos.sh all            # one of each non-destructive chaos
#   scripts/trigger-chaos.sh oom            # ONE-SHOT: container will crash
#
# Environment variables:
#   CHAOS_ALB_DNS  override ALB DNS (default: read from terraform output)
#   CHAOS_SCHEME   http or https (default: http)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

KIND="${1:-}"
COUNT="${2:-1}"
SCHEME="${CHAOS_SCHEME:-http}"

if [ -z "$KIND" ]; then
  echo "Usage: $0 <http|latency|oom|external|errorlog|all> [count]"
  exit 1
fi

if [ -z "${CHAOS_ALB_DNS:-}" ]; then
  CHAOS_ALB_DNS=$(cd "$ROOT/terraform/envs/dev" && terraform output -raw alb_dns_name)
fi

BASE="${SCHEME}://${CHAOS_ALB_DNS}"

hit() {
  local endpoint="$1"
  local extra="${2:-}"
  curl -s -o - -w "\n---\nHTTP %{http_code} in %{time_total}s\n" -X POST "${BASE}${endpoint}${extra}"
}

if [ "$KIND" = "all" ]; then
  echo "=== all (http, latency, external, errorlog) ==="
  hit "/chaos/http"
  hit "/chaos/latency"
  hit "/chaos/external"
  hit "/chaos/errorlog"
  exit 0
fi

for i in $(seq 1 "$COUNT"); do
  echo "=== ${KIND} (run ${i}/${COUNT}) -> ${BASE}/chaos/${KIND} ==="
  case "$KIND" in
    http|latency|external|oom)
      hit "/chaos/${KIND}"
      ;;
    errorlog)
      hit "/chaos/errorlog" "?include_pii=true"
      ;;
    *)
      echo "Unknown kind: $KIND"
      exit 1
      ;;
  esac
done
