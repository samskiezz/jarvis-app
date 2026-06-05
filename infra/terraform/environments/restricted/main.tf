# Environment: restricted
# Air-gapped / high-assurance composition for classified or regulated
# workloads. No public subnets, no NAT egress, encryption + rotation enforced,
# isolated GPU pool. Intended for sovereign / on-prem deployments.
# NOTE: requires real on-prem or sovereign-cloud infra; egress is denied.

terraform {
  required_version = ">= 1.5.0"
  # backend "s3" {}
}

locals {
  environment = "restricted"
  tags = {
    environment    = local.environment
    platform       = "jarvis-os"
    classification = "restricted"
    air_gapped     = "true"
  }
}

module "network" {
  source             = "../../modules/network"
  name               = "jarvis-restricted"
  cidr_block         = "10.40.0.0/16"
  public_subnets     = []
  enable_nat_gateway = false
  tags               = local.tags
}

module "kubernetes" {
  source       = "../../modules/kubernetes"
  cluster_name = "jarvis-restricted"
  subnet_ids   = module.network.private_subnet_ids
  node_count   = 5
  tags         = local.tags
}

module "postgres" {
  source     = "../../modules/postgres"
  identifier = "jarvis-restricted"
  multi_az   = true
  subnet_ids = module.network.private_subnet_ids
  tags       = local.tags
}

module "kafka" {
  source       = "../../modules/kafka"
  cluster_name = "jarvis-restricted"
  broker_count = 3
  subnet_ids   = module.network.private_subnet_ids
  tags         = local.tags
}

module "object_storage" {
  source      = "../../modules/object-storage"
  bucket_name = "jarvis-restricted-data"
  tags        = local.tags
}

module "secrets" {
  source        = "../../modules/secrets"
  name_prefix   = "jarvis-restricted"
  rotation_days = 7
  tags          = local.tags
}

module "observability" {
  source         = "../../modules/observability"
  name           = "jarvis-restricted"
  retention_days = 365
  tags           = local.tags
}

module "gpu_nodes" {
  source       = "../../modules/gpu-nodes"
  cluster_name = module.kubernetes.cluster_name
  node_count   = 2
  tags         = local.tags
}

output "cluster_endpoint" {
  value = module.kubernetes.cluster_endpoint
}
