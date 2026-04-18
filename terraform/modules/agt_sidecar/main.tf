variable "name_prefix" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "image_tag" { type = string }
variable "log_group_name" { type = string }
variable "upstream_endpoint" { type = string }

resource "aws_cloudwatch_log_group" "agt" {
  name              = var.log_group_name
  retention_in_days = 7
}

resource "aws_ecr_repository" "agt" {
  name                 = "${var.name_prefix}-agt-sidecar"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "agt" {
  name = "${var.name_prefix}-agt-cluster"
}

resource "aws_service_discovery_private_dns_namespace" "agt" {
  name = "ira.internal"
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "agt" {
  name = "agt"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.agt.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_security_group" "agt" {
  name_prefix = "${var.name_prefix}-agt-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 8081
    to_port     = 8081
    protocol    = "tcp"
    self        = true
    description = "Allow ingress from same SG (Lambda ENI also attached)"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "exec" {
  name               = "${var.name_prefix}-agt-exec"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "exec_managed" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-agt-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_ecs_task_definition" "agt" {
  family                   = "${var.name_prefix}-agt-sidecar"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "agt-sidecar"
      image     = "${aws_ecr_repository.agt.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = 8081, hostPort = 8081 }
      ]
      environment = [
        { name = "PORT", value = "8081" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "UPSTREAM_ENDPOINT", value = var.upstream_endpoint }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.region
          awslogs-stream-prefix = "agt-sidecar"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "agt" {
  name            = "${var.name_prefix}-agt-svc"
  cluster         = aws_ecs_cluster.agt.id
  task_definition = aws_ecs_task_definition.agt.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.agt.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.agt.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

output "ecr_repo_url" { value = aws_ecr_repository.agt.repository_url }
output "ecr_repo_name" { value = aws_ecr_repository.agt.name }
output "ecs_cluster_name" { value = aws_ecs_cluster.agt.name }
output "ecs_service_name" { value = aws_ecs_service.agt.name }
output "sg_id" { value = aws_security_group.agt.id }
output "service_dns" { value = "agt.${aws_service_discovery_private_dns_namespace.agt.name}" }
