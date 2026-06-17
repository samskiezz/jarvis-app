# Disposable GPU provider evaluation for UE5 Pixel Streaming

**Goal:** find a replacement for the current **vast.ai** GPU box that:

1. Runs a Linux UE5 Pixel Streaming build cleanly.
2. Exposes **NVENC** hardware encoding (H.264/H.265) without the driver bug we hit on the current Vast host.
3. Gives us either a **stable public IP/port** or an easy path to tunnel back to the Hostinger VPS so we can drop Cloudflare Tunnel.
4. Bills by the hour (or better, by the second/minute) so it stays disposable.

## Why we are not “just using the VPS + its GPU”

The **Hostinger VPS** (`76.13.176.135`) has **no GPU**. The GPU lives on the rented Vast.ai instance. Cloudflare Tunnel is currently used because Vast gives the box a private/NAT address with **rotating public ports**, so there is no stable way to point `app.projectsolar.cloud/jarvis/UnderworldUE5/` at it directly.

To eliminate Cloudflare we need a **persistent secure tunnel** from the GPU box into the Hostinger VPS (WireGuard or SSH reverse tunnel), or we need a GPU provider that hands us a **stable public IP** that Hostinger can proxy.

## Evaluation criteria

| Criterion | Why it matters |
|---|---|
| **Linux + NVIDIA GPU** | UE5 Linux build + Pixel Streaming plugin requires NVIDIA graphics and the Vulkan driver stack. |
| **NVENC works out of the box** | The current Vast host uses NVIDIA driver `590.48.01`, which has a known NVENC enumeration bug. We need a host with a stable driver (550.x / 560.x recommended) so UE5 can initialise `h264_nvenc`/`hevc_nvenc`. |
| **Public IP or easy tunnel** | Pixel Streaming needs WebRTC signalling (TCP 80/443) and ideally direct UDP media. A stable public IP is best; otherwise we tunnel TCP signalling and rely on a TURN relay for media. |
| **Inbound 443 / firewall control** | To serve `https://app.projectsolar.cloud/jarvis/UnderworldUE5/` directly from the GPU host, or to let Hostinger proxy to it. |
| **Hourly/billing** | We want to spin up, test, and destroy without monthly commitments. |
| **Price for a single stream** | We only need one GPU session for the JARVIS HUD. Mid-range cards (RTX 3090/4090, A4000, A5000, A6000, A10, L40S) are plenty. |

## Comparison matrix

| Provider | Model(s) for single stream | Approx. $/hr | Billing | Public IP / inbound | NVENC risk | Best for |
|---|---|---|---|---|---|---|
| **vast.ai** (current) | RTX 3090 / 4090 / A5000 / A6000 | $0.20–$0.55 | Per-hour marketplace | ❌ NAT + rotating public ports | **High on current host** (590.x driver bug; host-dependent) | Cheapest raw compute, but forces Cloudflare/tunnel |
| **RunPod** (Secure Cloud) | RTX 4090 / A5000 / A6000 / L40S / H100 | $0.69–$2.50+ | Per-second | ✅ Stable public IP; expose TCP ports; symmetrical-port trick | Low with data-center drivers | Best drop-in alternative: public IP, templates, easy Docker |
| **RunPod** (Community Cloud) | RTX 3090 / 4090 / A5000 | $0.35–$0.99 | Per-second | ⚠️ Public IP can change on restart | Low–medium (peer hosts, driver varies) | Cheapest RunPod tier, less reliable |
| **Lambda Labs** | A10 / RTX A6000 / RTX 6000 Ada / H100 | $0.75–$3.29 | Per-minute | ✅ Public IP; firewall rules open 80/443/UDP | Low (Lambda Stack drivers are stable) | Reliable bare-metal-like VM; good single-GPU choice |
| **Paperspace (Core)** | A4000 / A5000 / A6000 / A100 / H100 | $0.76–$5.95 | Per-hour | ✅ Public IP; optional static IP; firewall via console | Low | Managed VM, easy UI, higher price |
| **CoreWeave** | A40 / A100 / H100 / L40S | ~$2.00–$6.00+ | Hourly / contracts | ✅ Public IPv4 + LoadBalancer | Low | Enterprise/K8s scale; overkill for one disposable stream |

*Prices are public on-demand rates as of June 2026 and change frequently.*

## Provider deep dives

### 1. RunPod

- **How it works:** you create a *Pod* from a template (PyTorch, Ubuntu, etc.) or a custom Docker image. Pods can be **Community Cloud** (peer-hosted, cheaper) or **Secure Cloud** (RunPod-managed data-center hardware, more reliable).
- **Networking:** Secure Cloud pods get a stable public IP. You expose ports in the pod config; TCP ports are forwarded with a public IP:port. For symmetrical internal/external ports, use the `70000+` placeholder trick.
- **Pixel Streaming fit:** very good. You can reuse the existing `Dockerfile.ue5` / `docker-compose.yml` with `--runtime=nvidia` and `NVIDIA_DRIVER_CAPABILITIES=all`. Signalling on `:80`, streamer on `:8888`, expose both as TCP ports. For HTTPS you run Caddy + Let’s Encrypt on the pod, or proxy through Hostinger.
- **NVENC:** data-center Secure Cloud hosts usually run well-tested NVIDIA drivers. The Epic runtime-pixel-streaming image is known to work on RunPod when the container is launched with the NVIDIA runtime and full driver capabilities.
- **Cost:** cheapest reliable option for a public-IP RTX 4090 pod.
- **Risks:** Community Cloud pods can migrate/change IP; Secure Cloud costs more. UDP is not directly forwarded by RunPod, so WebRTC will rely on STUN/TURN or TCP candidates unless you use a direct public IP with the exposed TCP port.

### 2. Lambda Labs

- **How it works:** traditional cloud VM (Ubuntu 22.04 + Lambda Stack). You get root SSH access, full control, and a public IP.
- **Networking:** default firewall is SSH only; you can open HTTPS/HTTP/UDP ranges in the console or via API. That makes it straightforward to serve `https://<lambda-ip>/jarvis/UnderworldUE5/` directly, or to point a subdomain at the IP.
- **Pixel Streaming fit:** good. Native install matches our existing `provision-render-node.sh` / `launch-all.sh` path. No Docker required if you prefer bare metal, but Docker also works.
- **NVENC:** Lambda Stack ships stable NVIDIA drivers; NVENC generally works cleanly. A10 and RTX A6000 are both professional cards with full encode support.
- **Cost:** competitive for professional GPUs; no egress fees.
- **Risks:** capacity can tighten; no spot pricing. H100 is overkill; A10/RTX A6000 are the sweet spot.

### 3. Paperspace (Core / Gradient)

- **How it works:** managed Linux GPU VM, persistent storage, public IP. DigitalOcean-owned, straightforward console.
- **Networking:** public IP by default; optional static IP. Firewall controlled in console. No egress fees on Machines.
- **Pixel Streaming fit:** good, but pricing is higher than RunPod/Lambda for the same GPU class.
- **NVENC:** generally works; they use data-center drivers.
- **Cost:** A4000 ~$0.76/hr, A5000 ~$1.38/hr, A6000 ~$1.90/hr. More expensive but predictable.
- **Risks:** Gradient plans can add monthly fees; high-end GPUs may require a subscription tier.

### 4. CoreWeave

- **How it works:** Kubernetes-native bare-metal GPU cloud. You deploy containerized workloads on CKS.
- **Networking:** public IPv4 via LoadBalancer Services; can also bring your own IP.
- **Pixel Streaming fit:** possible but heavier. You would wrap the UE5 build in a container and expose it via a Kubernetes Service/Ingress. TensorWorks (Pixel Streaming at Scale) officially partners with CoreWeave.
- **NVENC:** works; bare metal with stable drivers.
- **Cost:** higher; usually contract/annual minimums for best rates.
- **Risks:** much higher operational complexity for a single disposable stream. Better suited to multi-stream production.

### 5. Staying on vast.ai (different host)

- **Why consider it:** cheapest option, and our deployment scripts are already built for it.
- **The NVENC fix:** the failure we see (`OpenEncodeSessionEx failed: unsupported device`) is tied to the **590.x driver** on the current host. A Vast offer running **550.x or 560.x** would likely not need the `LD_PRELOAD` hack and would let UE5 initialise NVENC.
- **The networking fix:** even with a clean driver, Vast still NATs the box. We would still need a **WireGuard or persistent SSH reverse tunnel** back to Hostinger to drop Cloudflare.
- **Risks:** marketplace reliability varies; public ports still rotate.

## Recommendation

**Primary recommendation: test RunPod Secure Cloud first.**

- It gives us a **stable public IP** on a data-center host, which solves the Cloudflare problem directly (point a DNS record or Hostinger proxy at it).
- It supports our existing **Docker/Caddy** stack with minimal changes.
- It is purpose-built for this kind of GPU workload and has the best chance of exposing NVENC cleanly.
- Per-second billing makes it truly disposable.

**Secondary recommendation: Lambda Labs A10 or RTX A6000** if RunPod Secure Cloud is out of stock or if you prefer a plain Ubuntu VM with full firewall control.

**Avoid CoreWeave for this evaluation** — it is excellent but adds Kubernetes complexity that is not justified for a single stream.

## Suggested 1-hour validation test

1. Sign up / log in to **RunPod** and add an SSH key.
2. Create a **Secure Cloud Pod**:
   - Template: Ubuntu 22.04 / CUDA / PyTorch, or import the existing `Dockerfile.ue5`.
   - GPU: **RTX 4090** or **RTX A6000**.
   - Expose TCP ports: `22`, `80`, `443`, `8888`.
3. Copy the existing packaged build to the pod:
   ```bash
   rsync -avz -e "ssh -i ~/.ssh/runpod_key" ./game/ root@<runpod-ip>:/workspace/pixelstream/game/
   ```
4. Run the existing stack:
   ```bash
   cd /workspace/pixelstream
   bash launch-all.sh
   ```
5. Check the UE5 log for:
   - `LogPixelStreaming: Using codec: H264` (hardware encode path).
   - No `Could not setup hardware encoder. Falling back to VP8/VP9`.
6. Open the exposed public URL and verify the stream loads.
7. Destroy the pod.

If the test succeeds, we can:
- Point `app.projectsolar.cloud/jarvis/UnderworldUE5/` to the RunPod public IP (via Hostinger nginx/Caddy), or
- Keep the RunPod URL as the `VITE_UNDERWORLD_PIXELSTREAM_URL`.

## What I need from you to actually run the test

To provision a pod/instance I need one of the following:

- **RunPod API key** (preferred for the first test), or
- **Lambda Labs API key**, or
- **Paperspace API key**.

No repo changes are needed for the evaluation itself. If a provider is chosen, the only follow-up work is:

1. Add a provider-specific deploy script next to `vast-deploy.sh` (e.g. `runpod-deploy.sh`).
2. Update `launch-all.sh` to expose the right public IP/ports.
3. Update `underworld/web/.env` / `VITE_UNDERWORLD_PIXELSTREAM_URL` and rebuild.
4. Optionally replace Cloudflare with direct DNS/proxy to the new host.
