variable "name_prefix" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "lambda_artifact_dir" { type = string }
variable "haiku_model_id" { type = string }
variable "haiku_base_model_id" { type = string }
variable "sonnet_model_id" { type = string }
variable "sonnet_base_model_id" { type = string }
variable "opus_model_id" { type = string }
variable "opus_base_model_id" { type = string }
variable "chaos_log_group_name" { type = string }
variable "incidents_table_name" { type = string }
variable "incidents_table_arn" { type = string }
variable "sns_topic_arn" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "lambda_security_groups" { type = list(string) }
variable "agt_service_dns" { type = string }
variable "eventbridge_rule_arn" { type = string }

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda_triage" {
  name              = "/aws/lambda/${var.name_prefix}-triage-haiku"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "lambda_investigate" {
  name              = "/aws/lambda/${var.name_prefix}-investigate-sonnet"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "lambda_rca" {
  name              = "/aws/lambda/${var.name_prefix}-rca-opus"
  retention_in_days = 7
}

data "aws_iam_policy_document" "lambda_base" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${var.name_prefix}-*:*"]
  }
  statement {
    actions   = ["logs:StartQuery", "logs:GetQueryResults"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "lambda_base" {
  name   = "${var.name_prefix}-lambda-base"
  policy = data.aws_iam_policy_document.lambda_base.json
}

# triage (Haiku only)
data "aws_iam_policy_document" "triage_bedrock" {
  statement {
    actions = ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:ConverseStream"]
    resources = [
      "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${var.haiku_model_id}",
      "arn:aws:bedrock:*::foundation-model/${var.haiku_base_model_id}"
    ]
  }
}

resource "aws_iam_role" "triage" {
  name               = "${var.name_prefix}-triage-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "triage_bedrock" {
  role   = aws_iam_role.triage.id
  policy = data.aws_iam_policy_document.triage_bedrock.json
}

resource "aws_iam_role_policy_attachment" "triage_base" {
  role       = aws_iam_role.triage.name
  policy_arn = aws_iam_policy.lambda_base.arn
}

resource "aws_lambda_function" "triage" {
  function_name    = "${var.name_prefix}-triage-haiku"
  role             = aws_iam_role.triage.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 60
  memory_size      = 512
  filename         = "${var.lambda_artifact_dir}/triage-haiku.zip"
  source_code_hash = filebase64sha256("${var.lambda_artifact_dir}/triage-haiku.zip")

  environment {
    variables = {
      HAIKU_MODEL_ID = var.haiku_model_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_triage]
}

# investigate (Sonnet only)
data "aws_iam_policy_document" "investigate_bedrock" {
  statement {
    actions = ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:ConverseStream"]
    resources = [
      "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${var.sonnet_model_id}",
      "arn:aws:bedrock:*::foundation-model/${var.sonnet_base_model_id}"
    ]
  }
}

resource "aws_iam_role" "investigate" {
  name               = "${var.name_prefix}-investigate-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "investigate_bedrock" {
  role   = aws_iam_role.investigate.id
  policy = data.aws_iam_policy_document.investigate_bedrock.json
}

resource "aws_iam_role_policy_attachment" "investigate_base" {
  role       = aws_iam_role.investigate.name
  policy_arn = aws_iam_policy.lambda_base.arn
}

resource "aws_lambda_function" "investigate" {
  function_name    = "${var.name_prefix}-investigate-sonnet"
  role             = aws_iam_role.investigate.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 120
  memory_size      = 1024
  filename         = "${var.lambda_artifact_dir}/investigate-sonnet.zip"
  source_code_hash = filebase64sha256("${var.lambda_artifact_dir}/investigate-sonnet.zip")

  environment {
    variables = {
      SONNET_MODEL_ID = var.sonnet_model_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_investigate]
}

# rca (Opus only, strict)
data "aws_iam_policy_document" "rca_bedrock" {
  statement {
    actions = ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:ConverseStream"]
    resources = [
      "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${var.opus_model_id}",
      "arn:aws:bedrock:*::foundation-model/${var.opus_base_model_id}"
    ]
  }
}

resource "aws_iam_role" "rca" {
  name               = "${var.name_prefix}-rca-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "rca_bedrock" {
  role   = aws_iam_role.rca.id
  policy = data.aws_iam_policy_document.rca_bedrock.json
}

resource "aws_iam_role_policy_attachment" "rca_base" {
  role       = aws_iam_role.rca.name
  policy_arn = aws_iam_policy.lambda_base.arn
}

resource "aws_lambda_function" "rca" {
  function_name    = "${var.name_prefix}-rca-opus"
  role             = aws_iam_role.rca.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 180
  memory_size      = 1024
  filename         = "${var.lambda_artifact_dir}/rca-opus.zip"
  source_code_hash = filebase64sha256("${var.lambda_artifact_dir}/rca-opus.zip")

  environment {
    variables = {
      OPUS_MODEL_ID = var.opus_model_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_rca]
}

# Step Functions state machine
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "sfn_policy" {
  statement {
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.triage.arn,
      aws_lambda_function.investigate.arn,
      aws_lambda_function.rca.arn
    ]
  }
  statement {
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [var.incidents_table_arn]
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [var.sns_topic_arn]
  }
  # ===== 重要なハマりポイント =====
  # Step Functions が CloudWatch Logs へ実行ログを流す場合、
  # logs:CreateLogDelivery 系の 8 権限が必須です。これが無いと CreateStateMachine が
  # "AccessDeniedException: The state machine IAM Role is not authorized to access
  # the Log Destination" で失敗します。これらの API はリソース ARN 指定が効かないため
  # resources は "*" にするしかありません（AWS 公式推奨）。
  statement {
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name_prefix}-sfn-role"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

resource "aws_iam_role_policy" "sfn" {
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn_policy.json
}

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/states/${var.name_prefix}-pipeline"
  retention_in_days = 7
}

resource "aws_sfn_state_machine" "pipeline" {
  name     = "${var.name_prefix}-pipeline"
  role_arn = aws_iam_role.sfn.arn

  definition = jsonencode({
    Comment = "Haiku -> Sonnet -> Opus escalation"
    StartAt = "Triage"
    States = {
      Triage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.triage.arn
          "Payload.$"  = "$"
        }
        ResultSelector = {
          "triage.$" = "$.Payload"
        }
        ResultPath = "$.result"
        Next       = "SeverityCheck"
      }
      SeverityCheck = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.result.triage.severity"
            StringEquals = "P1"
            Next         = "Investigate"
          },
          {
            Variable     = "$.result.triage.severity"
            StringEquals = "P2"
            Next         = "Investigate"
          }
        ]
        Default = "PersistTriageOnly"
      }
      Investigate = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.investigate.arn
          "Payload" = {
            "incidentId.$"   = "$.result.triage.incidentId"
            "triage.$"       = "$.result.triage"
            "logGroupName.$" = "$.logGroupName"
          }
        }
        ResultSelector = {
          "investigation.$" = "$.Payload"
        }
        ResultPath = "$.result2"
        Next       = "IsP1"
      }
      IsP1 = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.result.triage.severity"
            StringEquals = "P1"
            Next         = "RCA"
          }
        ]
        Default = "PersistWithSonnet"
      }
      RCA = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.rca.arn
          "Payload" = {
            "incidentId.$"    = "$.result.triage.incidentId"
            "triage.$"        = "$.result.triage"
            "investigation.$" = "$.result2.investigation"
            "logGroupName.$"  = "$.logGroupName"
          }
        }
        ResultSelector = {
          "rca.$" = "$.Payload"
        }
        ResultPath = "$.result3"
        Next       = "PersistWithOpus"
      }
      # P3 path: Haiku のみ
      PersistTriageOnly = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:putItem"
        Parameters = {
          TableName = var.incidents_table_name
          Item = {
            incident_id = { "S.$" = "$.result.triage.incidentId" }
            created_at  = { "S.$" = "$$.State.EnteredTime" }
            severity    = { "S.$" = "$.result.triage.severity" }
            summary     = { "S.$" = "$.result.triage.summary" }
            model_chain = { "S.$" = "States.Format('{}', $.result.triage.modelUsed)" }
            ttl         = { "N" = tostring(2592000) }
          }
        }
        ResultPath = null
        Next       = "Notify"
      }
      # P2 path: Haiku -> Sonnet
      PersistWithSonnet = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:putItem"
        Parameters = {
          TableName = var.incidents_table_name
          Item = {
            incident_id = { "S.$" = "$.result.triage.incidentId" }
            created_at  = { "S.$" = "$$.State.EnteredTime" }
            severity    = { "S.$" = "$.result.triage.severity" }
            summary     = { "S.$" = "$.result.triage.summary" }
            model_chain = { "S.$" = "States.Format('{} -> {}', $.result.triage.modelUsed, $.result2.investigation.modelUsed)" }
            ttl         = { "N" = tostring(2592000) }
          }
        }
        ResultPath = null
        Next       = "Notify"
      }
      # P1 path: Haiku -> Sonnet -> Opus
      PersistWithOpus = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:putItem"
        Parameters = {
          TableName = var.incidents_table_name
          Item = {
            incident_id = { "S.$" = "$.result.triage.incidentId" }
            created_at  = { "S.$" = "$$.State.EnteredTime" }
            severity    = { "S.$" = "$.result.triage.severity" }
            summary     = { "S.$" = "$.result.triage.summary" }
            model_chain = { "S.$" = "States.Format('{} -> {} -> {}', $.result.triage.modelUsed, $.result2.investigation.modelUsed, $.result3.rca.modelUsed)" }
            ttl         = { "N" = tostring(2592000) }
          }
        }
        ResultPath = null
        Next       = "Notify"
      }
      Notify = {
        Type     = "Task"
        Resource = "arn:aws:states:::sns:publish"
        Parameters = {
          TopicArn    = var.sns_topic_arn
          Subject     = "[IRA] incident detected"
          "Message.$" = "States.Format('Incident {} severity {}: {}', $.result.triage.incidentId, $.result.triage.severity, $.result.triage.summary)"
        }
        End = true
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    level                  = "ALL"
    include_execution_data = false
  }
}

# EventBridge -> StepFunctions binding
data "aws_iam_policy_document" "eb_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eb" {
  name               = "${var.name_prefix}-eb-role"
  assume_role_policy = data.aws_iam_policy_document.eb_assume.json
}

data "aws_iam_policy_document" "eb_policy" {
  statement {
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.pipeline.arn]
  }
}

resource "aws_iam_role_policy" "eb" {
  role   = aws_iam_role.eb.id
  policy = data.aws_iam_policy_document.eb_policy.json
}

resource "aws_cloudwatch_event_target" "sfn" {
  rule     = element(split("/", var.eventbridge_rule_arn), length(split("/", var.eventbridge_rule_arn)) - 1)
  arn      = aws_sfn_state_machine.pipeline.arn
  role_arn = aws_iam_role.eb.arn

  input_transformer {
    input_paths = {
      alarmName   = "$.detail.alarmName"
      reason      = "$.detail.state.reason"
      triggeredAt = "$.detail.state.timestamp"
    }
    input_template = jsonencode({
      alarmName    = "<alarmName>"
      alarmReason  = "<reason>"
      logGroupName = var.chaos_log_group_name
      triggeredAt  = "<triggeredAt>"
    })
  }
}

output "state_machine_arn" { value = aws_sfn_state_machine.pipeline.arn }
output "triage_function_name" { value = aws_lambda_function.triage.function_name }
output "investigate_function_name" { value = aws_lambda_function.investigate.function_name }
output "rca_function_name" { value = aws_lambda_function.rca.function_name }
