# Environment: dev
# Lowest-cost composition of platform modules for development. Single-AZ,
# minimal node counts, no GPU pool.
# NOTE: requires real cloud credentials/backend before `terraform apply`.

terraform {
  required_version = ">= 1.5.0"
  # NOTE: configure a real remote backend (e.g. s3) per environment.
  # backend "s3" {}
}

locals {
  environment = "dev"
  tags = {
    environment = local.environment
    platform    = "jarvis-os"
  }
}

module "network" {
  source             = "../../modules/network"
  name               = "jarvis-dev"
  cidr_block         = "10.10.0.0/16"
  enable_nat_gateway = false
  tags               = local.tags
}

module "kubernetes" {
  source             = "../../modules/kubernetes"
  cluster_name       = "jarvis-dev"
  subnet_ids         = module.network.private_subnet_ids
  node_count         = 2
  node_instance_type = "m6i.large"
  tags               = local.tags
}

module "postgres" {
  source         = "../../modules/postgres"
  identifier     = "jarvis-dev"
  instance_class = "db.t4g.medium"
  multi_az       = false
  subnet_ids     = module.network.private_subnet_ids
  tags           = local.tags
}

module "kafka" {
  source       = "../../modules/kafka"
  cluster_name = "jarvis-dev"
  broker_count = 1
  subnet_ids   = module.network.private_subnet_ids
  tags         = local.tags
}

module "object_storage" {
  source      = "../../modules/object-storage"
  bucket_name = "jarvis-dev-data"
  tags        = local.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = "jarvis-dev"
  tags        = local.tags
}

module "observability" {
  source         = "../../modules/observability"
  name           = "jarvis-dev"
  retention_days = 7
  tags           = local.tags
}

output "cluster_endpoint" {
  value = module.kubernetes.cluster_endpoint
}
