# Environment: prod
# Full-scale, multi-AZ, highly-available production composition with a
# dedicated GPU pool for AIP inference.
# NOTE: requires real cloud credentials/backend before `terraform apply`.

terraform {
  required_version = ">= 1.5.0"
  # backend "s3" {}
}

locals {
  environment = "prod"
  tags = {
    environment = local.environment
    platform    = "jarvis-os"
    compliance  = "soc2"
  }
}

module "network" {
  source          = "../../modules/network"
  name            = "jarvis-prod"
  cidr_block      = "10.30.0.0/16"
  private_subnets = ["10.30.1.0/24", "10.30.2.0/24", "10.30.3.0/24"]
  public_subnets  = ["10.30.101.0/24", "10.30.102.0/24", "10.30.103.0/24"]
  tags            = local.tags
}

module "kubernetes" {
  source             = "../../modules/kubernetes"
  cluster_name       = "jarvis-prod"
  subnet_ids         = module.network.private_subnet_ids
  node_count         = 6
  node_instance_type = "m6i.2xlarge"
  tags               = local.tags
}

module "postgres" {
  source               = "../../modules/postgres"
  identifier           = "jarvis-prod"
  instance_class       = "db.r6g.2xlarge"
  allocated_storage_gb = 500
  multi_az             = true
  subnet_ids           = module.network.private_subnet_ids
  tags                 = local.tags
}

module "kafka" {
  source       = "../../modules/kafka"
  cluster_name = "jarvis-prod"
  broker_count = 3
  subnet_ids   = module.network.private_subnet_ids
  tags         = local.tags
}

module "object_storage" {
  source      = "../../modules/object-storage"
  bucket_name = "jarvis-prod-data"
  tags        = local.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = "jarvis-prod"
  tags        = local.tags
}

module "observability" {
  source         = "../../modules/observability"
  name           = "jarvis-prod"
  retention_days = 90
  tags           = local.tags
}

module "gpu_nodes" {
  source            = "../../modules/gpu-nodes"
  cluster_name      = module.kubernetes.cluster_name
  node_count        = 4
  gpu_instance_type = "g5.4xlarge"
  tags              = local.tags
}

output "cluster_endpoint" {
  value = module.kubernetes.cluster_endpoint
}
