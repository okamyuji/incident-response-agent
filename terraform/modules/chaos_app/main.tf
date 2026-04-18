variable "name_prefix" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "alb_sg_ingress_cidr" { type = string }
variable "image_tag" { type = string }
variable "log_group_name" { type = string }

resource "aws_cloudwatch_log_group" "chaos" {
  name              = var.log_group_name
  retention_in_days = 7
}

resource "aws_ecr_repository" "chaos_app" {
  name                 = "${var.name_prefix}-chaos-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "chaos" {
  name = "${var.name_prefix}-chaos-cluster"
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.alb_sg_ingress_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "task" {
  name_prefix = "${var.name_prefix}-task-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "chaos" {
  name               = "${var.name_prefix}-chaos-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "chaos" {
  name        = "${var.name_prefix}-chaos-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
  }
}

resource "aws_lb_listener" "chaos" {
  load_balancer_arn = aws_lb.chaos.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chaos.arn
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
  name               = "${var.name_prefix}-chaos-exec"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "exec_managed" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-chaos-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_ecs_task_definition" "chaos" {
  family                   = "${var.name_prefix}-chaos-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "chaos-app"
      image     = "${aws_ecr_repository.chaos_app.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = 8080, hostPort = 8080 }
      ]
      environment = [
        { name = "PORT", value = "8080" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "RANDOM_SCHEDULER_ENABLED", value = "true" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.region
          awslogs-stream-prefix = "chaos-app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "chaos" {
  name            = "${var.name_prefix}-chaos-svc"
  cluster         = aws_ecs_cluster.chaos.id
  task_definition = aws_ecs_task_definition.chaos.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.chaos.arn
    container_name   = "chaos-app"
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.chaos]
}

output "alb_dns_name" { value = aws_lb.chaos.dns_name }
output "alb_arn" { value = aws_lb.chaos.arn }
output "alb_dimension" {
  description = "Dimension string 'app/name/id' used by CloudWatch ALB metrics"
  value       = regex("(app/[^/]+/[^/]+)$", aws_lb.chaos.arn)[0]
}
output "target_group_dimension" {
  description = "Dimension string 'targetgroup/name/id' used by CloudWatch metrics"
  value       = regex("(targetgroup/[^/]+/[^/]+)$", aws_lb_target_group.chaos.arn)[0]
}
output "ecr_repo_url" { value = aws_ecr_repository.chaos_app.repository_url }
output "ecr_repo_name" { value = aws_ecr_repository.chaos_app.name }
output "ecs_cluster_name" { value = aws_ecs_cluster.chaos.name }
output "ecs_service_name" { value = aws_ecs_service.chaos.name }
output "task_sg_id" { value = aws_security_group.task.id }

# observability 側の metric filter などが log group 作成完了を待てるよう、
# 名前だけでなく resource 参照そのものを公開する。
output "log_group_name" { value = aws_cloudwatch_log_group.chaos.name }
