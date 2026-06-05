# Module: object-storage
# Provisions an object storage bucket used for datasets, model artifacts and
# blob attachments within the data plane. Versioning and encryption on by
# default.
# NOTE: requires a real cloud provider object store (S3/GCS/Azure Blob).

terraform {
  required_version = ">= 1.5.0"
}

variable "bucket_name" {
  description = "Globally unique bucket name"
  type        = string
}

variable "versioning_enabled" {
  description = "Enable object versioning"
  type        = bool
  default     = true
}

variable "encryption_enabled" {
  description = "Enable server-side encryption"
  type        = bool
  default     = true
}

variable "lifecycle_days" {
  description = "Days before noncurrent versions expire"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Tags applied to the bucket"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_s3_bucket / google_storage_bucket.
resource "null_resource" "bucket" {
  triggers = {
    name       = var.bucket_name
    versioning = var.versioning_enabled
  }
}

output "bucket_name" {
  description = "Name of the bucket"
  value       = var.bucket_name
}

output "bucket_arn" {
  description = "Bucket identifier (placeholder)"
  value       = "arn:aws:s3:::${var.bucket_name}"
}
