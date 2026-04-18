#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ハマりポイント:
# ローカルの AWS CLI デフォルトリージョンが ap-northeast-1 などになっていると、
# us-east-1 の Step Functions state machine ARN を渡したときに
# "InvalidArn: Expected the ARN ... to be within region (ap-northeast-1)"
# で弾かれます。以下の各 aws コマンドで明示的に --region を付与します。
REGION="${AWS_REGION:-us-east-1}"

cd "$ROOT/terraform/envs/dev"
ALB=$(terraform output -raw alb_dns_name)
TABLE=$(terraform output -raw incidents_table_name)
SM_ARN=$(terraform output -raw state_machine_arn)

echo "=== ALB health ==="
curl -sf "http://${ALB}/health" | head -1

echo ""
echo "=== Trigger each chaos type ==="
for kind in http latency external errorlog; do
  echo "  - ${kind}"
  curl -s -o /dev/null -w "    HTTP %{http_code} in %{time_total}s\n" -X POST "http://${ALB}/chaos/${kind}"
done

echo ""
echo "=== Check Step Functions recent executions (last 5) ==="
aws --region "$REGION" stepfunctions list-executions --state-machine-arn "$SM_ARN" --max-items 5 \
  --query 'executions[].{name:name,status:status,startDate:startDate}' --output table

echo ""
echo "=== Check DynamoDB incidents (last 5) ==="
aws --region "$REGION" dynamodb scan --table-name "$TABLE" --max-items 5 \
  --query 'Items[].{incident_id:incident_id.S,severity:severity.S,summary:summary.S}' --output table

echo ""
echo "Verification complete. Inspect your email inbox for SNS notifications."
