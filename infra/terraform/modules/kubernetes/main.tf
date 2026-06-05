# Module: kubernetes
# Provisions a managed Kubernetes control plane and default node pool that hosts
# the platform's control, ontology and AIP planes. Consumes networking outputs
# from the network module.
# NOTE: requires a real cloud provider managed-K8s service (EKS/GKE/AKS).

terraform {
  required_version = ">= 1.5.0"
}

variable "cluster_name" {
  description = "Name of the Kubernetes cluster"
  type        = string
}

variable "kubernetes_version" {
  description = "Desired Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "subnet_ids" {
  description = "Subnet IDs the cluster nodes are placed in"
  type        = list(string)
}

variable "node_count" {
  description = "Default node pool size"
  type        = number
  default     = 3
}

variable "node_instance_type" {
  description = "Instance type for default node pool"
  type        = string
  default     = "m6i.xlarge"
}

variable "tags" {
  description = "Tags applied to cluster resources"
  type        = map(string)
  default     = {}
}

# NOTE: swap null_resource for aws_eks_cluster / google_container_cluster etc.
resource "null_resource" "cluster" {
  triggers = {
    name    = var.cluster_name
    version = var.kubernetes_version
  }
}

resource "null_resource" "default_node_pool" {
  triggers = {
    count = var.node_count
    type  = var.node_instance_type
  }
}

output "cluster_name" {
  description = "Name of the provisioned cluster"
  value       = null_resource.cluster.id
}

output "cluster_endpoint" {
  description = "API server endpoint (placeholder)"
  value       = "https://${var.cluster_name}.k8s.internal"
}

output "kubeconfig_secret" {
  description = "Name of the secret holding the kubeconfig"
  value       = "${var.cluster_name}-kubeconfig"
}
