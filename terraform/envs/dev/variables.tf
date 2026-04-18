variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "project_prefix" {
  type    = string
  default = "ira"
}

variable "notification_email" {
  type = string
}

variable "budget_limit_usd" {
  type    = number
  default = 30
}

variable "chaos_app_image_tag" {
  type    = string
  default = "latest"
}

variable "agt_sidecar_image_tag" {
  type    = string
  default = "latest"
}

variable "lambda_artifact_dir" {
  type    = string
  default = "../../../lambda/dist"
}
