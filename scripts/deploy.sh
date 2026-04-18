#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"

echo "[1/5] Building Lambda artifacts..."
cd "$ROOT/lambda" && pnpm install --frozen-lockfile=false >/dev/null && pnpm package

echo "[2/5] Building Node.js apps..."
cd "$ROOT/apps/chaos-app" && pnpm install --frozen-lockfile=false >/dev/null && pnpm build
cd "$ROOT/apps/agt-sidecar" && pnpm install --frozen-lockfile=false >/dev/null && pnpm build

echo "[3/5] Running terraform apply to ensure ECR repos, VPC, DynamoDB etc. exist..."
cd "$ROOT/terraform/envs/dev"
terraform init -input=false
terraform apply -auto-approve -target=module.ira.module.network -target=module.ira.module.chaos_app.aws_ecr_repository.chaos_app -target=module.ira.module.agt_sidecar.aws_ecr_repository.agt

CHAOS_ECR=$(terraform output -raw chaos_app_ecr_url)
AGT_ECR=$(terraform output -raw agt_sidecar_ecr_url)

echo "[4/5] Building and pushing container images..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker buildx build --platform=linux/amd64 --load -t "${CHAOS_ECR}:latest" "$ROOT/apps/chaos-app"
docker buildx build --platform=linux/amd64 --load -t "${AGT_ECR}:latest" "$ROOT/apps/agt-sidecar"
docker push "${CHAOS_ECR}:latest"
docker push "${AGT_ECR}:latest"

echo "[5/5] Full terraform apply..."
terraform apply -auto-approve

echo ""
echo "Deploy complete. ALB:"
terraform output -raw alb_dns_name
echo ""
echo "Confirm your SNS email subscription (sent to the address in terraform.tfvars) to receive alerts."
