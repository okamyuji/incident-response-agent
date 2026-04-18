terraform {
  required_version = ">= 1.14.0"
}

module "ira" {
  source = "../../"

  region                = var.region
  environment           = var.environment
  project_prefix        = var.project_prefix
  notification_email    = var.notification_email
  budget_limit_usd      = var.budget_limit_usd
  chaos_app_image_tag   = var.chaos_app_image_tag
  agt_sidecar_image_tag = var.agt_sidecar_image_tag
  lambda_artifact_dir   = var.lambda_artifact_dir
}

output "alb_dns_name" { value = module.ira.alb_dns_name }
output "chaos_app_ecr_url" { value = module.ira.chaos_app_ecr_url }
output "agt_sidecar_ecr_url" { value = module.ira.agt_sidecar_ecr_url }
output "chaos_app_ecs_cluster" { value = module.ira.chaos_app_ecs_cluster }
output "chaos_app_ecs_service" { value = module.ira.chaos_app_ecs_service }
output "agt_sidecar_ecs_cluster" { value = module.ira.agt_sidecar_ecs_cluster }
output "agt_sidecar_ecs_service" { value = module.ira.agt_sidecar_ecs_service }
output "state_machine_arn" { value = module.ira.state_machine_arn }
output "incidents_table_name" { value = module.ira.incidents_table_name }
output "sns_topic_arn" { value = module.ira.sns_topic_arn }
output "chaos_log_group_name" { value = module.ira.chaos_log_group_name }
