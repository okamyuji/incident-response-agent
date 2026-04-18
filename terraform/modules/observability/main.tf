variable "name_prefix" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "chaos_log_group_name" { type = string }
variable "agt_log_group_name" { type = string }
variable "sns_topic_arn" { type = string }
variable "alb_dimension" {
  type        = string
  description = "Format 'app/<name>/<id>' extracted from the ALB ARN"
  default     = ""
}
variable "target_group_dimension" {
  type        = string
  description = "Format 'targetgroup/<name>/<id>' extracted from the target group ARN"
  default     = ""
}
variable "chaos_cluster_name" {
  type    = string
  default = ""
}
variable "chaos_service_name" {
  type    = string
  default = ""
}

resource "aws_cloudwatch_log_data_protection_policy" "chaos_pii" {
  log_group_name = var.chaos_log_group_name

  policy_document = jsonencode({
    Name    = "${var.name_prefix}-chaos-data-protection"
    Version = "2021-06-01"
    Statement = [
      {
        Sid = "AuditSensitive"
        DataIdentifier = [
          "arn:aws:dataprotection::aws:data-identifier/EmailAddress",
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ]
        Operation = {
          Audit = {
            FindingsDestination = {}
          }
        }
      },
      {
        Sid = "DeidentifySensitive"
        DataIdentifier = [
          "arn:aws:dataprotection::aws:data-identifier/EmailAddress",
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ]
        Operation = {
          Deidentify = {
            MaskConfig = {}
          }
        }
      }
    ]
  })
}

# ===== 重要なハマりポイント =====
# CloudWatch の ELB/ECS 系メトリクスは必ずディメンション付きで発行されます。
# aws_cloudwatch_metric_alarm に dimensions を書き忘れると、メトリクスが届いていても
# アラームは OK のまま固定され、describe-alarms の StateReason に
# "no datapoints were received" と出ます（初回デプロイ時にここで 10 分以上空振りしました）。
# ALB の場合: ARN の `loadbalancer/app/<name>/<id>` の後半を正規表現で切り出して
#             LoadBalancer 次元に渡す必要があります。
# ECS の場合: ClusterName と ServiceName の両方が必要です。
resource "aws_cloudwatch_metric_alarm" "http_5xx" {
  alarm_name          = "${var.name_prefix}-http-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 3
  period              = 60
  statistic           = "Sum"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_dimension
  }

  alarm_description = "5xx spike from chaos-app target"

  tags = { Role = "incident-trigger" }
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.name_prefix}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 85
  period              = 60
  statistic           = "Average"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"

  dimensions = {
    ClusterName = var.chaos_cluster_name
    ServiceName = var.chaos_service_name
  }

  alarm_description = "ECS CPU sustained high"

  tags = { Role = "incident-trigger" }
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "${var.name_prefix}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 85
  period              = 60
  statistic           = "Average"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"

  dimensions = {
    ClusterName = var.chaos_cluster_name
    ServiceName = var.chaos_service_name
  }

  alarm_description = "ECS memory sustained high"

  tags = { Role = "incident-trigger" }
}

resource "aws_cloudwatch_metric_alarm" "target_unhealthy" {
  alarm_name          = "${var.name_prefix}-target-unhealthy"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 60
  statistic           = "Maximum"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_dimension
    TargetGroup  = var.target_group_dimension
  }

  alarm_description = "ALB target group has unhealthy host"

  tags = { Role = "incident-trigger" }
}

# ===== P1 severity ヒント検知 =====
# chaos-app の POST /chaos/p1 エンドポイントが "severity_hint":"P1" を含む
# JSON ログを emit する。Metric Filter で件数をカウントし、1 件でも出たら
# 即座にアラームを発報して Step Functions を起動する。
resource "aws_cloudwatch_log_metric_filter" "p1_severity_hint" {
  name           = "${var.name_prefix}-p1-severity-hint"
  log_group_name = var.chaos_log_group_name
  pattern        = "{ $.severity_hint = \"P1\" }"

  metric_transformation {
    name          = "P1SeverityHintCount"
    namespace     = "IRA/Chaos"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "p1_severity_hint" {
  alarm_name          = "${var.name_prefix}-p1-severity-hint"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 60
  statistic           = "Sum"
  metric_name         = aws_cloudwatch_log_metric_filter.p1_severity_hint.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.p1_severity_hint.metric_transformation[0].namespace
  treat_missing_data  = "notBreaching"

  alarm_description = "P1 severity hint observed in chaos-app logs"

  tags = { Role = "incident-trigger" }
}

resource "aws_cloudwatch_event_rule" "alarm_to_pipeline" {
  name        = "${var.name_prefix}-alarm-to-pipeline"
  description = "Triggers the agent pipeline on CloudWatch alarm state change"

  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      state = {
        value = ["ALARM"]
      }
      alarmName = [
        { prefix = var.name_prefix }
      ]
    }
  })
}

output "chaos_log_group_name" { value = var.chaos_log_group_name }
output "agt_log_group_name" { value = var.agt_log_group_name }
output "eventbridge_rule_arn" { value = aws_cloudwatch_event_rule.alarm_to_pipeline.arn }
output "eventbridge_rule_name" { value = aws_cloudwatch_event_rule.alarm_to_pipeline.name }
