variable "name_prefix" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }

# AWS Config は region あたり 1 recorder のみ。既に別プロジェクトで有効化済みの場合は
# apply が衝突するため、tfvars の enable フラグで制御できる構造にしている。

locals {
  bucket_name = "${var.name_prefix}-config-${var.account_id}"
}

# Config が書き込む S3 bucket。dev のため force_destroy=true で destroy 時も完全削除する。
resource "aws_s3_bucket" "config" {
  bucket        = local.bucket_name
  force_destroy = true

  tags = {
    Name    = local.bucket_name
    Project = "incident-response-agent"
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid     = "AWSConfigBucketPermissionsCheck"
    actions = ["s3:GetBucketAcl"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    resources = [aws_s3_bucket.config.arn]
  }
  statement {
    sid     = "AWSConfigBucketExistenceCheck"
    actions = ["s3:ListBucket"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    resources = [aws_s3_bucket.config.arn]
  }
  statement {
    sid     = "AWSConfigBucketDelivery"
    actions = ["s3:PutObject"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    resources = ["${aws_s3_bucket.config.arn}/AWSLogs/${var.account_id}/Config/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "config" {
  bucket = aws_s3_bucket.config.id
  policy = data.aws_iam_policy_document.bucket_policy.json
}

data "aws_iam_policy_document" "config_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "config" {
  name               = "${var.name_prefix}-config-role"
  assume_role_policy = data.aws_iam_policy_document.config_assume.json
}

resource "aws_iam_role_policy_attachment" "config_managed" {
  role       = aws_iam_role.config.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_config_configuration_recorder" "this" {
  name     = "${var.name_prefix}-recorder"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

# ===== 重要なハマりポイント =====
# delivery_channel に sns_topic_arn を設定すると、全 managed rule の初回評価結果が
# NON_COMPLIANT リソース数だけ SNS に流れてメール爆撃になる（EC2_SECURITY_GROUP_ATTACHED_TO_ENI
# だけで account 内の浮いた SG 全件が通知される）。dev では Console でダッシュボードを
# 見れば十分なので SNS 連携は外す。通知が必要な場合は EventBridge rule で
# high-severity のみフィルタリングすること。
resource "aws_config_delivery_channel" "this" {
  name           = "${var.name_prefix}-delivery"
  s3_bucket_name = aws_s3_bucket.config.bucket

  depends_on = [aws_config_configuration_recorder.this]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}

# Managed rules: dev 用に 4 個だけ。全リソース記録だと月 $数 USD 程度。
# - iam-password-policy: ルート/IAM パスワード強度の検知
# - restricted-ssh: 0.0.0.0/0 からの 22 許可を検知
# - s3-bucket-public-read-prohibited: S3 public 読み取り許可の検知
# - ec2-security-group-attached-to-eni: SG 未アタッチの浮いた SG を検知
resource "aws_config_config_rule" "iam_password_policy" {
  name = "${var.name_prefix}-iam-password-policy"
  source {
    owner             = "AWS"
    source_identifier = "IAM_PASSWORD_POLICY"
  }
  depends_on = [aws_config_configuration_recorder_status.this]
}

resource "aws_config_config_rule" "restricted_ssh" {
  name = "${var.name_prefix}-restricted-ssh"
  source {
    owner             = "AWS"
    source_identifier = "INCOMING_SSH_DISABLED"
  }
  depends_on = [aws_config_configuration_recorder_status.this]
}

resource "aws_config_config_rule" "s3_public_read" {
  name = "${var.name_prefix}-s3-public-read-prohibited"
  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
  }
  depends_on = [aws_config_configuration_recorder_status.this]
}

resource "aws_config_config_rule" "sg_attached" {
  name = "${var.name_prefix}-sg-attached-to-eni"
  source {
    owner             = "AWS"
    source_identifier = "EC2_SECURITY_GROUP_ATTACHED_TO_ENI"
  }
  depends_on = [aws_config_configuration_recorder_status.this]
}

output "recorder_name" { value = aws_config_configuration_recorder.this.name }
output "bucket_name" { value = aws_s3_bucket.config.bucket }
