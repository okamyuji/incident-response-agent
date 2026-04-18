output "alb_dns_name" {
  description = "ALB DNS name for chaos-app"
  value       = module.chaos_app.alb_dns_name
}

output "chaos_app_ecr_url" {
  description = "ECR repository URL for chaos-app"
  value       = module.chaos_app.ecr_repo_url
}

output "agt_sidecar_ecr_url" {
  description = "ECR repository URL for agt-sidecar"
  value       = module.agt_sidecar.ecr_repo_url
}

output "chaos_app_ecs_cluster" {
  value = module.chaos_app.ecs_cluster_name
}

output "chaos_app_ecs_service" {
  value = module.chaos_app.ecs_service_name
}

output "agt_sidecar_ecs_cluster" {
  value = module.agt_sidecar.ecs_cluster_name
}

output "agt_sidecar_ecs_service" {
  value = module.agt_sidecar.ecs_service_name
}

output "state_machine_arn" {
  value = module.agent_pipeline.state_machine_arn
}

output "incidents_table_name" {
  value = module.storage.incidents_table_name
}

output "sns_topic_arn" {
  value = module.notifications.topic_arn
}

output "chaos_log_group_name" {
  value = module.observability.chaos_log_group_name
}
