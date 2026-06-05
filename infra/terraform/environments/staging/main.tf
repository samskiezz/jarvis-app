# Environment: staging
# Production-like composition at reduced scale for pre-release validation.
# Multi-AZ enabled, includes a small GPU pool.
# NOTE: requires real cloud credentials/backend before `terraform apply`.

terraform {
  required_version = ">= 1.5.0"
  # backend "s3" {}
}

locals {
  environment = "staging"
  tags = {
    environment = local.environment
    platform    = "jarvis-os"
  }
}

module "network" {
  source     = "../../modules/network"
  name       = "jarvis-staging"
  cidr_block = "10.20.0.0/16"
  tags       = local.tags
}

module "kubernetes" {
  source       = "../../modules/kubernetes"
  cluster_name = "jarvis-staging"
  subnet_ids   = module.network.private_subnet_ids
  node_count   = 3
  tags         = local.tags
}

module "postgres" {
  source     = "../../modules/postgres"
  identifier = "jarvis-staging"
  multi_az   = true
  subnet_ids = module.network.private_subnet_ids
  tags       = local.tags
}

module "kafka" {
  source       = "../../modules/kafka"
  cluster_name = "jarvis-staging"
  broker_count = 3
  subnet_ids   = module.network.private_subnet_ids
  tags         = local.tags
}

module "object_storage" {
  source      = "../../modules/object-storage"
  bucket_name = "jarvis-staging-data"
  tags        = local.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = "jarvis-staging"
  tags        = local.tags
}

module "observability" {
  source         = "../../modules/observability"
  name           = "jarvis-staging"
  retention_days = 30
  tags           = local.tags
}

module "gpu_nodes" {
  source       = "../../modules/gpu-nodes"
  cluster_name = module.kubernetes.cluster_name
  node_count   = 1
  tags         = local.tags
}

output "cluster_endpoint" {
  value = module.kubernetes.cluster_endpoint
}
