locals {
  name_prefix = "${var.project_prefix}-${var.environment}"
  common_tags = {
    Project = "incident-response-agent"
    Env     = var.environment
  }
}

data "aws_caller_identity" "current" {}

module "network" {
  source      = "./modules/network"
  name_prefix = local.name_prefix
  cidr_block  = "10.20.0.0/16"
}

module "notifications" {
  source             = "./modules/notifications"
  name_prefix        = local.name_prefix
  notification_email = var.notification_email
}

module "storage" {
  source      = "./modules/storage"
  name_prefix = local.name_prefix
}

module "chaos_app" {
  source              = "./modules/chaos_app"
  name_prefix         = local.name_prefix
  region              = var.region
  vpc_id              = module.network.vpc_id
  public_subnet_ids   = module.network.public_subnet_ids
  private_subnet_ids  = module.network.private_subnet_ids
  alb_sg_ingress_cidr = "0.0.0.0/0"
  image_tag           = var.chaos_app_image_tag
  log_group_name      = "/ecs/${local.name_prefix}-chaos-app"
}

module "observability" {
  source                 = "./modules/observability"
  name_prefix            = local.name_prefix
  region                 = var.region
  account_id             = data.aws_caller_identity.current.account_id
  chaos_log_group_name   = module.chaos_app.log_group_name
  agt_log_group_name     = "/ecs/${local.name_prefix}-agt-sidecar"
  sns_topic_arn          = module.notifications.topic_arn
  alb_dimension          = module.chaos_app.alb_dimension
  target_group_dimension = module.chaos_app.target_group_dimension
  chaos_cluster_name     = module.chaos_app.ecs_cluster_name
  chaos_service_name     = module.chaos_app.ecs_service_name
}

module "agt_sidecar" {
  source             = "./modules/agt_sidecar"
  name_prefix        = local.name_prefix
  region             = var.region
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  image_tag          = var.agt_sidecar_image_tag
  log_group_name     = module.observability.agt_log_group_name
  upstream_endpoint  = "https://bedrock-runtime.${var.region}.amazonaws.com/"
}

module "agent_pipeline" {
  source                 = "./modules/agent_pipeline"
  name_prefix            = local.name_prefix
  region                 = var.region
  account_id             = data.aws_caller_identity.current.account_id
  lambda_artifact_dir    = var.lambda_artifact_dir
  haiku_model_id         = var.haiku_model_id
  haiku_base_model_id    = var.haiku_base_model_id
  sonnet_model_id        = var.sonnet_model_id
  sonnet_base_model_id   = var.sonnet_base_model_id
  opus_model_id          = var.opus_model_id
  opus_base_model_id     = var.opus_base_model_id
  chaos_log_group_name   = module.observability.chaos_log_group_name
  incidents_table_name   = module.storage.incidents_table_name
  incidents_table_arn    = module.storage.incidents_table_arn
  sns_topic_arn          = module.notifications.topic_arn
  private_subnet_ids     = module.network.private_subnet_ids
  lambda_security_groups = [module.agt_sidecar.sg_id]
  agt_service_dns        = module.agt_sidecar.service_dns
  eventbridge_rule_arn   = module.observability.eventbridge_rule_arn
}

module "budgets" {
  source             = "./modules/budgets"
  name_prefix        = local.name_prefix
  limit_usd          = var.budget_limit_usd
  notification_email = var.notification_email
}

module "guardduty" {
  count         = var.enable_guardduty ? 1 : 0
  source        = "./modules/guardduty"
  name_prefix   = local.name_prefix
  sns_topic_arn = module.notifications.topic_arn
}

module "config_governance" {
  count       = var.enable_config ? 1 : 0
  source      = "./modules/config_governance"
  name_prefix = local.name_prefix
  region      = var.region
  account_id  = data.aws_caller_identity.current.account_id
}
