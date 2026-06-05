# Environment: edge
# Lightweight composition for edge / forward-deployed sites running the
# fleet-agent. Single small cluster, local storage, no Kafka, optional GPU.
# Syncs back to a central plane over a constrained link.
# NOTE: requires real edge hardware / lightweight K8s (k3s) at the site.

terraform {
  required_version = ">= 1.5.0"
  # backend "s3" {}
}

locals {
  environment = "edge"
  tags = {
    environment = local.environment
    platform    = "jarvis-os"
    topology    = "edge"
  }
}

module "network" {
  source             = "../../modules/network"
  name               = "jarvis-edge"
  cidr_block         = "10.50.0.0/24"
  private_subnets    = ["10.50.0.0/25"]
  public_subnets     = []
  enable_nat_gateway = false
  tags               = local.tags
}

module "kubernetes" {
  source             = "../../modules/kubernetes"
  cluster_name       = "jarvis-edge"
  subnet_ids         = module.network.private_subnet_ids
  node_count         = 1
  node_instance_type = "m6i.large"
  tags               = local.tags
}

module "object_storage" {
  source             = "../../modules/object-storage"
  bucket_name        = "jarvis-edge-cache"
  versioning_enabled = false
  tags               = local.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = "jarvis-edge"
  tags        = local.tags
}

module "observability" {
  source         = "../../modules/observability"
  name           = "jarvis-edge"
  retention_days = 3
  enable_tracing = false
  tags           = local.tags
}

output "cluster_endpoint" {
  value = module.kubernetes.cluster_endpoint
}
