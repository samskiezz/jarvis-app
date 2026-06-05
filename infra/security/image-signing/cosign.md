# Image Signing with Cosign

All container images deployed to the Jarvis platform MUST be signed with
[cosign](https://github.com/sigstore/cosign) and verified at admission time by
the Gatekeeper / OPA policy (`infra/security/opa/policy.rego` enforces the
trusted registry; signature verification is enforced by the admission webhook).

## Signing key

Signing keys live in Vault's transit engine (`transit/sign/jarvis-signing`,
see `infra/security/vault/policies/platform.hcl`). For local/dev a keypair can
be generated:

```sh
cosign generate-key-pair
```

> NOTE: production signing requires the real Vault cluster + KMS; do not commit
> private keys to the repository.

## Signing an image (CI step)

```sh
cosign sign --key vault://transit/jarvis-signing \
  registry.internal/jarvis/control-plane:0.1.0
```

## Verifying an image

```sh
cosign verify --key vault://transit/jarvis-signing \
  registry.internal/jarvis/control-plane:0.1.0
```

## Admission enforcement

The cluster runs a Sigstore policy controller (or Gatekeeper constraint) that
rejects any pod whose images are unsigned or signed by an untrusted key.
Trusted registry prefix: `registry.internal/`.
