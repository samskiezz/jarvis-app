# Module: kafka
# Provisions a managed Kafka cluster providing the event backbone for the
# ontology change-data-capture stream and AIP pipelines.
# NOTE: requires real infra (MSK / Confluent Cloud / Strimzi on K8s).

terraform {
  required_version = ">= 1.5.0"
}

variable "cluster_name" {
  description = "Kafka cluster name"
  type        = string
}

variable "kafka_version" {
  description = "Kafka broker version"
  type        = string
  default     = "3.7.0"
}

variable "broker_count" {
  description = "Number of broker nodes"
  type        = number
  default     = 3
}

variable "broker_instance_type" {
  description = "Instance type per broker"
  type        = string
  default     = "kafka.m5.large"
}

variable "subnet_ids" {
  description = "Subnets for broker placement"
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to Kafka resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_msk_cluster or a Strimzi Kafka CR.
resource "null_resource" "kafka" {
  triggers = {
    name    = var.cluster_name
    version = var.kafka_version
    brokers = var.broker_count
  }
}

output "bootstrap_brokers" {
  description = "Bootstrap broker connection string (placeholder)"
  value       = "${var.cluster_name}-kafka.internal:9092"
}

output "cluster_arn" {
  description = "Cluster identifier"
  value       = null_resource.kafka.id
}
