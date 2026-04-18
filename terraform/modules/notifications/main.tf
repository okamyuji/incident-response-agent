variable "name_prefix" { type = string }
variable "notification_email" { type = string }

resource "aws_sns_topic" "incidents" {
  name = "${var.name_prefix}-incident-notifications"
}

# 複数の AWS サービスから SNS publish するため topic policy を広めに許可する。
# EventBridge (GuardDuty / CloudWatch Alarm)、Config、Budgets をカバーする。
data "aws_iam_policy_document" "topic_policy" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.incidents.arn]
    principals {
      type = "Service"
      identifiers = [
        "events.amazonaws.com",
        "config.amazonaws.com",
        "budgets.amazonaws.com"
      ]
    }
  }
}

resource "aws_sns_topic_policy" "incidents" {
  arn    = aws_sns_topic.incidents.arn
  policy = data.aws_iam_policy_document.topic_policy.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.incidents.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

output "topic_arn" { value = aws_sns_topic.incidents.arn }
output "topic_name" { value = aws_sns_topic.incidents.name }
