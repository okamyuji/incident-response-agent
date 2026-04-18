#!/usr/bin/env bash
set -euo pipefail

export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4567}"

echo "Waiting for LocalStack to be ready..."
for i in $(seq 1 30); do
  if curl -sf "$ENDPOINT/_localstack/health" >/dev/null; then
    echo "LocalStack ready."
    break
  fi
  sleep 2
done

echo "Creating DynamoDB table..."
aws --endpoint-url="$ENDPOINT" dynamodb create-table \
  --table-name ira-dev-incidents \
  --attribute-definitions AttributeName=incident_id,AttributeType=S AttributeName=created_at,AttributeType=S \
  --key-schema AttributeName=incident_id,KeyType=HASH AttributeName=created_at,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || echo "(table may already exist)"

echo "Creating SNS topic..."
TOPIC_ARN=$(aws --endpoint-url="$ENDPOINT" sns create-topic --name ira-dev-incident-notifications --query 'TopicArn' --output text)
echo "  topic: $TOPIC_ARN"

echo "Creating CloudWatch Log groups..."
aws --endpoint-url="$ENDPOINT" logs create-log-group --log-group-name /ecs/ira-dev-chaos-app 2>&1 | tail -1 || true
aws --endpoint-url="$ENDPOINT" logs create-log-group --log-group-name /ecs/ira-dev-agt-sidecar 2>&1 | tail -1 || true

echo "LocalStack bootstrap complete."
