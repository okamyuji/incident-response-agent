variable "name_prefix" { type = string }
variable "notification_email" { type = string }

resource "aws_sns_topic" "incidents" {
  name = "${var.name_prefix}-incident-notifications"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.incidents.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

output "topic_arn" { value = aws_sns_topic.incidents.arn }
output "topic_name" { value = aws_sns_topic.incidents.name }
