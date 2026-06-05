# Module: secrets
# Provisions a secrets management backend (KMS key + secret store) for platform
# credentials, signing keys and service identities.
# NOTE: requires real infra (AWS Secrets Manager / Vault / GCP Secret Manager).

terraform {
  required_version = ">= 1.5.0"
}

variable "name_prefix" {
  description = "Prefix for managed secrets"
  type        = string
}

variable "kms_key_alias" {
  description = "Alias for the encryption key"
  type        = string
  default     = "platform-secrets"
}

variable "rotation_days" {
  description = "Automatic rotation interval in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to secret resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_kms_key + aws_secretsmanager_secret or vault_mount.
resource "null_resource" "kms_key" {
  triggers = {
    alias = var.kms_key_alias
  }
}

resource "null_resource" "secret_store" {
  triggers = {
    prefix = var.name_prefix
  }
}

output "kms_key_id" {
  description = "KMS key identifier"
  value       = null_resource.kms_key.id
}

output "secret_store_id" {
  description = "Secret store identifier"
  value       = null_resource.secret_store.id
}
