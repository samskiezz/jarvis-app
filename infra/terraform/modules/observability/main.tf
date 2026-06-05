# Module: observability
# Provisions managed observability primitives: a metrics workspace, log group
# and tracing backend that the Prometheus/OTel/Grafana stack ships data to.
# NOTE: requires real infra (AMP/CloudWatch/Grafana Cloud/Tempo).

terraform {
  required_version = ">= 1.5.0"
}

variable "name" {
  description = "Observability stack name prefix"
  type        = string
}

variable "retention_days" {
  description = "Log and metric retention in days"
  type        = number
  default     = 30
}

variable "enable_tracing" {
  description = "Provision a tracing backend"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to observability resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_prometheus_workspace, aws_cloudwatch_log_group, etc.
resource "null_resource" "metrics_workspace" {
  triggers = {
    name = var.name
  }
}

resource "null_resource" "log_group" {
  triggers = {
    retention = var.retention_days
  }
}

output "metrics_workspace_id" {
  description = "Metrics workspace identifier"
  value       = null_resource.metrics_workspace.id
}

output "log_group_name" {
  description = "Log group name"
  value       = "${var.name}-logs"
}

output "remote_write_endpoint" {
  description = "Prometheus remote-write endpoint (placeholder)"
  value       = "https://${var.name}.metrics.internal/api/v1/remote_write"
}
