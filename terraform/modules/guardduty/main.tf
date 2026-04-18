variable "name_prefix" { type = string }
variable "sns_topic_arn" {
  type        = string
  description = "SNS topic for high-severity findings"
}

# GuardDuty detector 本体。VPC Flow Logs と CloudTrail 管理イベントは既定で source として
# 取り込まれるため、追加の Flow Logs 設定は不要（このリポジトリは既に CloudTrail 管理イベント
# 利用前提）。Malware Protection や S3 Logs 保護は dev ではコストが跳ねるため無効のまま。
resource "aws_guardduty_detector" "this" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  tags = {
    Name    = "${var.name_prefix}-guardduty"
    Project = "incident-response-agent"
  }
}

# 高重大度 (severity >= 7.0) finding を既存の notifications SNS にルーティング。
# dev では 1 エンドポイント集約でシンプルに受ける。
resource "aws_cloudwatch_event_rule" "high_severity_findings" {
  name        = "${var.name_prefix}-guardduty-high-severity"
  description = "Route high-severity GuardDuty findings to SNS"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", 7.0] }]
    }
  })
}

resource "aws_cloudwatch_event_target" "to_sns" {
  rule = aws_cloudwatch_event_rule.high_severity_findings.name
  arn  = var.sns_topic_arn

  input_transformer {
    input_paths = {
      title       = "$.detail.title"
      severity    = "$.detail.severity"
      description = "$.detail.description"
    }
    input_template = "\"[GuardDuty] severity <severity>: <title> — <description>\""
  }
}

output "detector_id" { value = aws_guardduty_detector.this.id }
