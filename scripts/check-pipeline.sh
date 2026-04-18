#!/usr/bin/env bash
# Detailed inspection of the last pipeline run.
# Shows CloudWatch Alarm state, recent Step Functions executions, DynamoDB records,
# SNS topic metrics, and the last Lambda invocation summary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"

cd "$ROOT/terraform/envs/dev"
SM_ARN=$(terraform output -raw state_machine_arn)
TABLE=$(terraform output -raw incidents_table_name)
TOPIC=$(terraform output -raw sns_topic_arn)

echo "=== CloudWatch Alarm state ==="
aws --region "$REGION" cloudwatch describe-alarms --alarm-name-prefix ira-dev \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' --output table

echo ""
echo "=== Step Functions recent executions ==="
aws --region "$REGION" stepfunctions list-executions --state-machine-arn "$SM_ARN" --max-items 5 \
  --query 'executions[].{name:name,status:status,startDate:startDate}' --output table

echo ""
echo "=== DynamoDB incidents table contents (last 10) ==="
aws --region "$REGION" dynamodb scan --table-name "$TABLE" --max-items 10 \
  --query 'Items[].{incident_id:incident_id.S,severity:severity.S,summary:summary.S,created_at:created_at.S}' --output table

echo ""
echo "=== SNS topic subscription state ==="
aws --region "$REGION" sns list-subscriptions-by-topic --topic-arn "$TOPIC" \
  --query 'Subscriptions[].{Endpoint:Endpoint,Protocol:Protocol,Status:SubscriptionArn}' --output table

echo ""
echo "=== Lambda recent invocations (count, last hour) ==="
for fn in ira-dev-triage-haiku ira-dev-investigate-sonnet ira-dev-rca-opus; do
  count=$(aws --region "$REGION" cloudwatch get-metric-statistics \
    --namespace AWS/Lambda --metric-name Invocations \
    --dimensions Name=FunctionName,Value="$fn" \
    --start-time "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')" \
    --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --period 3600 --statistics Sum \
    --query 'Datapoints[0].Sum' --output text 2>/dev/null || echo "0")
  printf "  %-30s invocations: %s\n" "$fn" "${count:-0}"
done
