variable "name_prefix" { type = string }

resource "aws_dynamodb_table" "incidents" {
  name         = "${var.name_prefix}-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"
  range_key    = "created_at"

  attribute {
    name = "incident_id"
    type = "S"
  }
  attribute {
    name = "created_at"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }
}

output "incidents_table_name" { value = aws_dynamodb_table.incidents.name }
output "incidents_table_arn" { value = aws_dynamodb_table.incidents.arn }
