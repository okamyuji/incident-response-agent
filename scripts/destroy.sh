#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"

# terraform destroy は aws_lambda_function.source_code_hash=filebase64sha256(...) を
# 評価するため、ローカルに zip が無いと "no such file or directory" で手詰まりになる。
# apply 後に lambda/dist を消していた場合に備えて、destroy 前に必ず zip を再生成しておく。
echo "[0/3] Ensuring Lambda artifacts exist for destroy..."
if [ ! -f "$ROOT/lambda/dist/triage-haiku.zip" ] \
  || [ ! -f "$ROOT/lambda/dist/investigate-sonnet.zip" ] \
  || [ ! -f "$ROOT/lambda/dist/rca-opus.zip" ]; then
  echo "  zips missing, rebuilding via pnpm package..."
  cd "$ROOT/lambda" && pnpm install --frozen-lockfile=false >/dev/null && pnpm package >/dev/null
else
  echo "  zips present, skipping rebuild"
fi

cd "$ROOT/terraform/envs/dev"

echo "[1/3] terraform destroy..."
terraform destroy -auto-approve

echo ""
echo "[2/3] Orphan resource check..."
echo "  VPCs tagged Project=incident-response-agent:"
aws ec2 describe-vpcs --region "$REGION" --filters "Name=tag:Project,Values=incident-response-agent" --query 'Vpcs[].VpcId' --output text

echo "  Log groups with ira- prefix:"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix /aws/lambda/ira- --query 'logGroups[].logGroupName' --output text
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix /ecs/ira- --query 'logGroups[].logGroupName' --output text

echo "  DynamoDB tables with ira- prefix:"
aws dynamodb list-tables --region "$REGION" --query 'TableNames[?starts_with(@, `ira-`)]' --output text

echo "  ECR repos with ira- prefix:"
aws ecr describe-repositories --region "$REGION" --query 'repositories[?starts_with(repositoryName, `ira-`)].repositoryName' --output text

echo ""
echo "[3/3] Destroy complete. Inspect Cost Explorer for billing confirmation."
echo "Filter: Tag Project = incident-response-agent"
