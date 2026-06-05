# Module: postgres
# Provisions a managed PostgreSQL instance used as the primary transactional
# store for the control plane and ontology metadata.
# NOTE: requires a real cloud provider managed database (RDS/Cloud SQL).

terraform {
  required_version = ">= 1.5.0"
}

variable "identifier" {
  description = "Database instance identifier"
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "instance_class" {
  description = "Instance size class"
  type        = string
  default     = "db.r6g.large"
}

variable "allocated_storage_gb" {
  description = "Allocated storage in gigabytes"
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Whether to deploy across multiple availability zones"
  type        = bool
  default     = true
}

variable "subnet_ids" {
  description = "Subnets for the DB subnet group"
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to database resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_db_instance / google_sql_database_instance.
resource "null_resource" "postgres" {
  triggers = {
    id      = var.identifier
    version = var.engine_version
    class   = var.instance_class
  }
}

output "endpoint" {
  description = "Connection endpoint (placeholder)"
  value       = "${var.identifier}.postgres.internal:5432"
}

output "instance_id" {
  description = "Database instance id"
  value       = null_resource.postgres.id
}

output "credentials_secret" {
  description = "Secret name holding DB credentials"
  value       = "${var.identifier}-credentials"
}
