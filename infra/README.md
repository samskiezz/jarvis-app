# Jarvis Enterprise OS — Infrastructure (`infra/`)

This directory holds the infrastructure-as-code skeletons for the Jarvis
enterprise OS. It is organized as the **infrastructure layer (Layer B)** of the
platform: the manifests here describe *how* the platform is deployed, separate
from the application code in `server/` (Layer A).

> Layer B (Terraform / Kubernetes / Helm) requires **real infrastructure** to
> apply: cloud credentials, a remote state backend, live clusters, GPU
> hardware, a Vault cluster, etc. Everything in this tree is parseable and
> well-formed but uses placeholders (`null_resource`, sample endpoints) wherever
> a real provider or cluster is needed. Such spots are flagged with `NOTE:`
> comments.

## Layout

```
infra/
├── terraform/
│   ├── modules/            Reusable building blocks (variable/output/resource)
│   │   ├── network/        VPC, subnets, routing, NAT
│   │   ├── kubernetes/     Managed K8s control plane + default node pool
│   │   ├── postgres/       Managed PostgreSQL
│   │   ├── kafka/          Managed Kafka event backbone
│   │   ├── object-storage/ Versioned, encrypted object store
│   │   ├── secrets/        KMS key + secret store
│   │   ├── observability/  Metrics workspace, logs, tracing backend
│   │   └── gpu-nodes/      Tainted GPU node pool for the AIP plane
│   └── environments/       Per-environment compositions of the modules
│       ├── dev/            Single-AZ, minimal, no GPU
│       ├── staging/        Prod-like at reduced scale + small GPU pool
│       ├── prod/           Full HA multi-AZ + GPU pool
│       ├── restricted/     Air-gapped / high-assurance, no public egress
│       └── edge/           Lightweight forward-deployed sites
├── kubernetes/
│   ├── namespaces/         One namespace per plane
│   ├── network-policies/   Default-deny + DNS allow
│   ├── pod-security/       Pod Security "restricted" profile
│   └── rbac/               Platform cluster roles, namespaced roles, bindings
├── helm/
│   ├── control-plane/      API gateway, auth, orchestration
│   ├── ontology-plane/     Object model, links, CDC
│   ├── aip-plane/          Model serving, agents, pipelines (GPU)
│   └── fleet-agent/        Edge DaemonSet
├── observability/
│   ├── prometheus/         Scrape config + remote write
│   ├── grafana/            Datasource provisioning
│   └── otel/               OpenTelemetry Collector pipelines
└── security/
    ├── opa/                Deny-by-default Rego authz policy
    ├── spire/              SPIFFE/SPIRE server config (workload identity)
    ├── vault/policies/     Least-privilege Vault policy (HCL)
    ├── cert-manager/       Internal CA + issuers (mTLS)
    ├── image-signing/      Cosign signing/verification workflow
    └── admission-control/  Gatekeeper trusted-registry constraint
```

## Planes

The platform is segmented into isolation planes, each mapped to a Kubernetes
namespace and (where relevant) a Helm chart:

- **control-plane** — API gateway, authn/authz, orchestration.
- **ontology-plane** — object/link model and change-data-capture stream.
- **aip-plane** — AI model serving, agents and pipelines (GPU-backed).
- **data-plane** — datasets and storage integration.
- **observability** — metrics, logs, traces.
- **fleet** — edge / forward-deployed agents.

## Usage (requires real infra)

```sh
# Terraform — per environment
cd terraform/environments/dev
terraform init    # NOTE: configure the remote backend first
terraform plan

# Kubernetes manifests
kubectl apply -f kubernetes/namespaces/namespaces.yaml
kubectl apply -f kubernetes/network-policies/
kubectl apply -f kubernetes/rbac/

# Helm
helm install control-plane ./helm/control-plane -n control-plane
```

## Validation

YAML files are validated with:

```sh
python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('infra/**/*.yaml',recursive=True)+glob.glob('infra/**/*.yml',recursive=True)]; print('yaml ok', len(glob.glob('infra/**/*.y*ml',recursive=True)))"
```
