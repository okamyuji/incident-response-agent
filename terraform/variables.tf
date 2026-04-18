variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "project_prefix" {
  description = "Name prefix for all resources"
  type        = string
  default     = "ira"
}

variable "notification_email" {
  description = "Email address receiving SNS alerts"
  type        = string
}

variable "budget_limit_usd" {
  description = "AWS Budgets monthly cap in USD"
  type        = number
  default     = 30
}

# ===== 重要なハマりポイント =====
# Bedrock モデル ID はリージョン提供状況とモデル世代で大きく変わります。
# 2026年4月時点で Claude 4.x 系は米国リージョン集約で、「Cross-region inference profile」
# (us.anthropic.xxx) 経由での利用がデフォルトです。suffix の付き方もモデルによって
# 不揃い（Sonnet は日付/バージョン無し、Haiku/Opus は日付+v1:0 付き）のため、
# コンソールの Playground で "API リクエストを表示" を押して modelId (ARN) を確認し、
# ここの default を合わせてください。
# 2026-04-18 時点の実確認値:
#   - Haiku 4.5: us.anthropic.claude-haiku-4-5-20251001-v1:0
#   - Sonnet 4.6: us.anthropic.claude-sonnet-4-6
#   - Opus 4.5: us.anthropic.claude-opus-4-5-20251101-v1:0
# また、IAM ポリシーでは cross-region profile の ARN と、profile が転送する先の
# foundation-model ARN (全リージョン wildcard) の両方を resources に入れないと、
# 実行時に AccessDeniedException になります。
variable "haiku_model_id" {
  description = "Bedrock cross-region inference profile id for triage"
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "haiku_base_model_id" {
  description = "Base foundation-model id that the haiku profile forwards to"
  type        = string
  default     = "anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "sonnet_model_id" {
  description = "Bedrock cross-region inference profile id for investigation"
  type        = string
  default     = "us.anthropic.claude-sonnet-4-6"
}

variable "sonnet_base_model_id" {
  description = "Base foundation-model id that the sonnet profile forwards to"
  type        = string
  default     = "anthropic.claude-sonnet-4-6"
}

variable "opus_model_id" {
  description = "Bedrock cross-region inference profile id for RCA (P1)"
  type        = string
  default     = "us.anthropic.claude-opus-4-5-20251101-v1:0"
}

variable "opus_base_model_id" {
  description = "Base foundation-model id that the opus profile forwards to"
  type        = string
  default     = "anthropic.claude-opus-4-5-20251101-v1:0"
}

variable "chaos_app_image_tag" {
  description = "Image tag for chaos-app"
  type        = string
  default     = "latest"
}

variable "agt_sidecar_image_tag" {
  description = "Image tag for agt-sidecar"
  type        = string
  default     = "latest"
}

variable "lambda_artifact_dir" {
  description = "Path to compiled Lambda zip artifacts"
  type        = string
  default     = "../../lambda/dist"
}

variable "enable_guardduty" {
  description = "Enable GuardDuty detector. Set false if already enabled account-wide."
  type        = bool
  default     = true
}

variable "enable_config" {
  description = "Enable AWS Config recorder and rules. Set false if another recorder exists in the region."
  type        = bool
  default     = true
}
