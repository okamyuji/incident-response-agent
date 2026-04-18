variable "name_prefix" { type = string }
variable "cidr_block" { type = string }

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az_primary     = data.aws_availability_zones.available.names[0]
  az_secondary   = data.aws_availability_zones.available.names[1]
  public_cidr    = cidrsubnet(var.cidr_block, 4, 0)
  public_cidr_b  = cidrsubnet(var.cidr_block, 4, 2)
  private_cidr   = cidrsubnet(var.cidr_block, 4, 1)
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name_prefix}-igw" }
}

# ===== 重要なハマりポイント =====
# Application Load Balancer は作成時に「最低 2 つの異なる AZ のサブネット」を要求します。
# Single-AZ で NAT Gateway 1 本のコスト最小構成にしたくても、ALB を置くなら public subnet
# だけは 2 AZ に分けざるを得ません（初回デプロイ時に
# "At least two subnets in two different Availability Zones must be specified" で失敗）。
# コスト最適化のため、public subnet のみ 2 AZ、private subnet と NAT Gateway は 1 AZ に
# 留めます（private 側のトラフィックは単一 NAT で十分）。
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidr
  availability_zone       = local.az_primary
  map_public_ip_on_launch = true

  tags = { Name = "${var.name_prefix}-public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidr_b
  availability_zone       = local.az_secondary
  map_public_ip_on_launch = true

  tags = { Name = "${var.name_prefix}-public-b" }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_cidr
  availability_zone = local.az_primary

  tags = { Name = "${var.name_prefix}-private" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.name_prefix}-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id

  tags       = { Name = "${var.name_prefix}-nat" }
  depends_on = [aws_internet_gateway.igw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = { Name = "${var.name_prefix}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }

  tags = { Name = "${var.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_ids" { value = [aws_subnet.public.id, aws_subnet.public_b.id] }
output "private_subnet_ids" { value = [aws_subnet.private.id] }
output "nat_gateway_id" { value = aws_nat_gateway.nat.id }
