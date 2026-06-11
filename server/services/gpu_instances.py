#!/usr/bin/env python3
"""
GPU INSTANCE MANAGER — disposable Vast.ai GPU instances, A→Z, controlled from the JARVIS dock.

Every GPU task is a fresh, disposable instance: search the cheapest matching offer → create it →
SSH in and run the on-start setup → run the task → sync ALL results down to Hostinger storage →
destroy the instance. Instances can also be left running, stopped/started, and COPIED (clone the
exact image+disk+setup to a brand-new instance) at any time. Multiple instances can run at once.

Requires the Vast.ai account API key (console.vast.ai → Account → API Key) as env VAST_API_KEY.
Everything else (SSH key, Hostinger storage path) is already on the box. Without the key, every
call returns {ok:False, need_key:True} so the UI can prompt for it — nothing else breaks.

REST API: https://console.vast.ai/api/v0/  (Bearer auth). SSH: ~/.ssh/id_ed25519.
"""
import os, json, time, subprocess, urllib.request, urllib.error

ROOT        = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS_DIR = os.path.join(ROOT, "server", "data", "gpu_results")     # Hostinger storage landing zone
STATE_PATH  = os.path.join(ROOT, "server", "data", "gpu_instances.json")
SSH_KEY     = os.path.expanduser(os.environ.get("VAST_SSH_KEY", "~/.ssh/id_ed25519"))
API_BASE    = "https://console.vast.ai/api/v0"

# default disposable image + on-start: CUDA + python, ready for compute; cheap + fast to boot.
DEFAULT_IMAGE   = os.environ.get("GPU_IMAGE", "pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime")
DEFAULT_DISK_GB = int(os.environ.get("GPU_DISK_GB", "30"))
DEFAULT_MAXPRICE= float(os.environ.get("GPU_MAX_PRICE", "0.50"))      # $/hr ceiling — cheap by default


def estimate_task_vram(task: str) -> dict:
    """Read the task and work out how much GPU VRAM it actually needs, so we never put a 32B model on a
    4GB card. Heuristic from model size (…b params) + whether it's training. Returns {gb, why}."""
    import re
    t = (task or "").lower()
    train = any(w in t for w in ("train", "fine-tune", "finetune", "sft", "lora", "pretrain", "dreambooth"))
    m = re.search(r"(\d+(?:\.\d+)?)\s*b\b", t)            # 70b, 32b, 13b, 7b, 1.5b …
    if m:
        params = float(m.group(1))
        per = 2.4 if train else 0.7                       # GB per billion params (fp16 + overhead; train holds optimizer states)
        gb = max(6, int(params * per) + 2)
        return {"gb": gb, "why": "%s%gB model%s" % ("train " if train else "", params, " (training)" if train else " (inference)")}
    if any(w in t for w in ("sdxl", "stable diffusion", "stable-diffusion", "diffusion", "flux")):
        return {"gb": 16 if train else 12, "why": "image-diffusion model"}
    if any(w in t for w in ("whisper", "xtts", "tts", "embed", "embedding", "ocr")):
        return {"gb": 8, "why": "audio/embedding model"}
    if any(w in t for w in ("nvidia-smi", "test", "hello", "echo")):
        return {"gb": 4, "why": "trivial / smoke test (any GPU)"}
    return {"gb": 12, "why": "general GPU task (default headroom)"}


def api_key() -> str:
    k = (os.environ.get("VAST_API_KEY") or "").strip()
    if k:
        return k
    # gitignored secret file (the .env is git-tracked, so the key must NOT live there)
    try:
        with open(os.path.join(ROOT, "server", "data", ".vast_key")) as f:
            return f.read().strip()
    except Exception:  # noqa: BLE001
        return ""


def configured() -> bool:
    return bool(api_key())


def _req(method: str, path: str, body=None, timeout: float = 30.0):
    """Call the Vast REST API. Returns parsed JSON or raises."""
    url = API_BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + api_key(),
        "Accept": "application/json", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw.strip() else {}


def _guard():
    if not configured():
        return {"ok": False, "need_key": True,
                "error": "No Vast.ai API key. Add it in console.vast.ai → Account → API Key, then set VAST_API_KEY."}
    return None


# ── instance lifecycle ─────────────────────────────────────────────────────
def list_instances() -> dict:
    g = _guard()
    if g: return g
    try:
        d = _req("GET", "/instances/")
        out = []
        for it in (d.get("instances") or []):
            out.append({
                "id": it.get("id"), "status": it.get("actual_status") or it.get("cur_state"),
                "gpu": it.get("gpu_name"), "num_gpus": it.get("num_gpus"),
                "vram_gb": round(float(it.get("gpu_ram") or 0) * float(it.get("num_gpus") or 1) / 1024, 1),
                "price": round(float(it.get("dph_total") or 0), 3),
                "image": it.get("image_uuid") or it.get("image"),
                "ssh_host": it.get("ssh_host"), "ssh_port": it.get("ssh_port"),
                "gpu_util": it.get("gpu_util"), "label": it.get("label"),
                # FULL spec profile (used to find a genuinely-similar cheaper box, not just same VRAM):
                "dlperf": round(float(it.get("dlperf") or 0), 1),          # Vast deep-learning perf score
                "cpu_cores": it.get("cpu_cores"), "cpu_ram_gb": round(float(it.get("cpu_ram") or 0)/1024, 1),
                "disk_gb": round(float(it.get("disk_space") or 0), 0),
                "inet_down": round(float(it.get("inet_down") or 0), 0), "inet_up": round(float(it.get("inet_up") or 0), 0),
                "compute_cap": it.get("compute_cap"),
            })
        return {"ok": True, "instances": out}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def cheapest_offer(gpu_name: str = None, max_price: float = None, num_gpus: int = 1, min_vram_gb: float = 0) -> dict:
    """Cheapest reliable offer that ALSO has enough total VRAM for the task (min_vram_gb). Auto-scales to
    multi-GPU if a single card can't hold it, so we never assign too little VRAM. gpu_ram is per-card MB."""
    g = _guard()
    if g: return g
    max_price = max_price or DEFAULT_MAXPRICE
    if gpu_name:
        gpu_name = gpu_name.replace("_", " ").strip()   # UI sends RTX_4090 → Vast uses "RTX 4090"
    from urllib.parse import quote
    need_mb = float(min_vram_gb) * 1024.0
    # allow 1, 2, 4 GPUs so big models can spread across cards; widen price ceiling for big jobs
    cap = max_price if min_vram_gb <= 24 else max(max_price, 2.0)
    candidates = []
    for ng in (1, 2, 4):
        q = {"verified": {"eq": True}, "rentable": {"eq": True}, "num_gpus": {"eq": ng},
             "dph_total": {"lte": cap}, "order": [["dph_total", "asc"]], "type": "on-demand", "limit": 64}
        if gpu_name:
            q["gpu_name"] = {"eq": gpu_name}
        try:
            d = _req("GET", "/bundles/?q=" + quote(json.dumps(q)))
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:200]}
        for o in (d.get("offers") or []):
            tot_mb = float(o.get("gpu_ram") or 0) * float(o.get("num_gpus") or 1)
            if o.get("rentable") and float(o.get("dph_total") or 99) <= cap and tot_mb >= need_mb \
               and (not gpu_name or o.get("gpu_name") == gpu_name):
                candidates.append(o)
    if not candidates:
        return {"ok": False, "error": "no offer with ≥%gGB VRAM under $%.2f/hr%s" % (min_vram_gb, cap, " ("+gpu_name+")" if gpu_name else "")}
    candidates.sort(key=lambda o: float(o.get("dph_total") or 99))
    o = candidates[0]
    return {"ok": True, "offer": {"id": o.get("id"), "gpu": o.get("gpu_name"), "num_gpus": o.get("num_gpus"),
            "price": round(float(o.get("dph_total") or 0), 3),
            "total_vram_gb": round(float(o.get("gpu_ram") or 0)*float(o.get("num_gpus") or 1)/1024, 1),
            "reliability": round(float(o.get("reliability2") or 0), 3)}}


def create_instance(offer_id: int, image: str = None, disk_gb: int = None, onstart: str = "", label: str = "jarvis-gpu") -> dict:
    g = _guard()
    if g: return g
    body = {"client_id": "me", "image": image or DEFAULT_IMAGE,
            "disk": disk_gb or DEFAULT_DISK_GB, "label": label, "runtype": "ssh"}
    if onstart:
        body["onstart"] = onstart
    try:
        d = _req("PUT", "/asks/%d/" % int(offer_id), body)
        if d.get("success") or d.get("new_contract"):
            return {"ok": True, "id": d.get("new_contract"), "raw": d}
        return {"ok": False, "error": json.dumps(d)[:200]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def cheapest_similar(src: dict, max_price: float = None) -> dict:
    """Cheapest offer that matches the SOURCE across EVERY key spec Vast exposes — not just VRAM:
    total VRAM, DL-perf (compute), CPU cores + system RAM, disk, network, and CUDA compute capability.
    Each must be ≥ a sensible fraction of the source so the cheaper box is genuinely equivalent, not weaker."""
    g = _guard()
    if g: return g
    from urllib.parse import quote
    cap = max_price or max(float(src.get("price") or 1.0), 0.05)     # never pick something pricier than the source
    # GPU-capability specs are matched TIGHTLY (these define equivalent compute power); host specs are
    # adequacy FLOORS (the source is usually wildly over-provisioned on RAM/cores, so requiring ≥source
    # there would forbid any saving). This is what "similar specs, cheapest" actually means.
    need = {
        "vram":   float(src.get("vram_gb") or 0) * 1024 * 0.90,                  # ≥90% total VRAM (tight)
        "dlperf": float(src.get("dlperf") or 0) * 0.80,                          # ≥80% DL-perf (tight — real GPU power)
        "cc":     float(src.get("compute_cap") or 0) * 0.85,                     # ≥ same GPU class/CUDA (tight)
        "cpuram": min(float(src.get("cpu_ram_gb") or 0) * 1024, 32 * 1024),      # adequacy: ≤ source, capped at 32GB
        "cores":  min(float(src.get("cpu_cores") or 0) * 0.25, 16),             # adequacy floor
        "disk":   float(src.get("disk_gb") or 0) * 0.8,                          # need room for the data
        "net":    min(float(src.get("inet_down") or 0) * 0.3, 300),             # adequacy: decent bandwidth
    }
    best = None; checked = 0
    for ng in (1, 2, 4, 8):
        q = {"verified": {"eq": True}, "rentable": {"eq": True}, "num_gpus": {"eq": ng},
             "dph_total": {"lte": cap}, "order": [["dph_total", "asc"]], "type": "on-demand", "limit": 96}
        try:
            offers = (_req("GET", "/bundles/?q=" + quote(json.dumps(q))).get("offers") or [])
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:200]}
        for o in offers:
            checked += 1
            ngc = float(o.get("num_gpus") or 1)
            if not o.get("rentable"): continue
            if float(o.get("gpu_ram") or 0) * ngc < need["vram"]: continue
            if float(o.get("dlperf") or 0)        < need["dlperf"]: continue
            if float(o.get("cpu_ram") or 0)       < need["cpuram"]: continue
            if float(o.get("cpu_cores") or 0)     < need["cores"]: continue
            if float(o.get("disk_space") or 0)    < need["disk"]: continue
            if float(o.get("inet_down") or 0)     < need["net"]: continue
            if float(o.get("compute_cap") or 0)   < need["cc"]: continue
            if best is None or float(o.get("dph_total") or 99) < float(best.get("dph_total") or 99):
                best = o
    if not best:
        return {"ok": False, "error": "no box matching ALL source specs (VRAM/DL-perf/CPU/RAM/disk/net/CUDA) under $%.3f/hr (checked %d offers)" % (cap, checked)}
    return {"ok": True, "offer": {
        "id": best.get("id"), "gpu": best.get("gpu_name"), "num_gpus": best.get("num_gpus"),
        "price": round(float(best.get("dph_total") or 0), 3),
        "total_vram_gb": round(float(best.get("gpu_ram") or 0)*float(best.get("num_gpus") or 1)/1024, 1),
        "dlperf": round(float(best.get("dlperf") or 0), 1),
        "cpu_ram_gb": round(float(best.get("cpu_ram") or 0)/1024, 1), "cpu_cores": best.get("cpu_cores"),
        "disk_gb": round(float(best.get("disk_space") or 0), 0),
        "inet_down": round(float(best.get("inet_down") or 0), 0), "compute_cap": best.get("compute_cap"),
        "reliability": round(float(best.get("reliability2") or 0), 3)}}


def set_state(instance_id: int, running: bool) -> dict:
    g = _guard()
    if g: return g
    try:
        _req("PUT", "/instances/%d/" % int(instance_id), {"state": "running" if running else "stopped"})
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def destroy_instance(instance_id: int) -> dict:
    g = _guard()
    if g: return g
    try:
        _req("DELETE", "/instances/%d/" % int(instance_id))
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def copy_instance(instance_id: int, max_price: float = None) -> dict:
    """COPY ACROSS = recoup the old instance's workspace to Hostinger FIRST (so nothing is lost), then
    create a new same-GPU instance whose on-start pulls that saved workspace back in — the data moves with it."""
    g = _guard()
    if g: return g
    src = next((i for i in (list_instances().get("instances") or []) if i["id"] == int(instance_id)), None)
    if not src:
        return {"ok": False, "error": "source instance not found"}
    recoup = sync_results(int(instance_id), "/workspace")   # pull EVERYTHING (results + checkpoints) down first
    # CHEAPEST WITH SIMILAR SPECS — matched across ALL specs (VRAM, DL-perf, CPU, RAM, disk, net, CUDA),
    # not just VRAM, so the cheaper box is genuinely equivalent.
    off = cheapest_similar(src, max_price=max_price)
    if not off.get("ok"):
        return off
    new = create_instance(off["offer"]["id"], image=src.get("image"),
                          label="jarvis-gpu-copy", disk_gb=DEFAULT_DISK_GB)
    new["copied_from"] = int(instance_id)
    new["source_specs"] = {"gpu": src.get("gpu"), "vram_gb": src.get("vram_gb"), "price": src.get("price")}
    new["new_specs"] = off.get("offer")
    if src.get("price") and off.get("offer", {}).get("price"):
        new["saving_per_hr"] = round(src["price"] - off["offer"]["price"], 3)
    new["data_recouped"] = bool(recoup.get("ok"))
    new["recoup_dir"] = recoup.get("dest")
    new["recoup_note"] = None if recoup.get("ok") else "source is stopped — start it to migrate live /workspace files"
    return new


def safe_dispose(instance_id: int, force: bool = False) -> dict:
    """RECOUP-THEN-DESTROY: try to sync the full /workspace (results + checkpoints) to Hostinger, then
    destroy. By default REFUSES if recoup fails (nothing lost). force=True (user-authorised) destroys
    anyway — used when the box is stopped/empty or the user explicitly wants it gone regardless."""
    g = _guard()
    if g: return g
    if force:
        d = destroy_instance(int(instance_id))   # user-authorised: destroy NOW, no slow SSH recoup (which hangs on a booting/stopped box)
        d["forced"] = True; d["recoup_ok"] = False
        return d
    recoup = sync_results(int(instance_id), "/workspace")
    if not recoup.get("ok"):
        return {"ok": False, "error": "REFUSED to destroy — recoup failed (" + str(recoup.get("error") or recoup.get("stderr") or "")[:120] + "). Data not lost; try Save→Hostinger then dispose, or force.", "recoup": recoup}
    d = destroy_instance(int(instance_id))
    d["recouped_to"] = recoup.get("dest"); d["recoup_ok"] = bool(recoup.get("ok")); d["forced"] = force
    return d


# ── SSH automation + Hostinger result sync ─────────────────────────────────
def _ssh_base(host: str, port: int):
    return ["ssh", "-i", SSH_KEY, "-p", str(port), "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=12", "root@" + host]


def run_on_instance(instance_id: int, command: str, timeout: float = 600) -> dict:
    """SSH into the instance and run a command, capturing output."""
    g = _guard()
    if g: return g
    inst = next((i for i in (list_instances().get("instances") or []) if i["id"] == int(instance_id)), None)
    if not inst or not inst.get("ssh_host"):
        return {"ok": False, "error": "instance has no SSH endpoint yet (still booting?)"}
    try:
        r = subprocess.run(_ssh_base(inst["ssh_host"], inst["ssh_port"]) + [command],
                           capture_output=True, text=True, timeout=timeout)
        return {"ok": r.returncode == 0, "stdout": r.stdout[-4000:], "stderr": r.stderr[-1500:], "code": r.returncode}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def sync_results(instance_id: int, remote_path: str = "/workspace/results") -> dict:
    """scp results from the instance DOWN to Hostinger storage (server/data/gpu_results/<id>/)."""
    g = _guard()
    if g: return g
    inst = next((i for i in (list_instances().get("instances") or []) if i["id"] == int(instance_id)), None)
    if not inst or not inst.get("ssh_host"):
        return {"ok": False, "error": "instance has no SSH endpoint"}
    dest = os.path.join(RESULTS_DIR, str(instance_id))
    os.makedirs(dest, exist_ok=True)
    try:
        r = subprocess.run(["scp", "-i", SSH_KEY, "-P", str(inst["ssh_port"]), "-r",
                            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                            "root@%s:%s/." % (inst["ssh_host"], remote_path), dest],
                           capture_output=True, text=True, timeout=900)
        return {"ok": r.returncode == 0, "dest": dest, "stderr": r.stderr[-800:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def launch_disposable(task_cmd: str, gpu_name: str = None, max_price: float = None,
                      image: str = None, label: str = "jarvis-task") -> dict:
    """A→Z disposable GPU task: cheapest offer → create → (the dock then polls until ready, runs the
    task, syncs results to Hostinger, and destroys). Returns the new instance id to track."""
    g = _guard()
    if g: return g
    # AUTO-SIZE: read the task → required VRAM → pick a GPU that can actually hold it (never too small).
    vram = estimate_task_vram(task_cmd)
    off = cheapest_offer(gpu_name=gpu_name, max_price=max_price, min_vram_gb=vram["gb"])
    if not off.get("ok"):
        off["vram_needed_gb"] = vram["gb"]; off["why"] = vram["why"]
        return off
    # onstart: stage the task + always run it INTO /workspace (which safe_dispose/copy recoup wholesale).
    onstart = ("mkdir -p /workspace/results && cd /workspace && echo %s > task.sh && chmod +x task.sh && "
               "(bash task.sh > /workspace/results/run.log 2>&1; echo done > /workspace/results/STATUS) &") % json.dumps(task_cmd)
    created = create_instance(off["offer"]["id"], image=image, onstart=onstart, label=label)
    if created.get("ok"):
        created["offer"] = off["offer"]
        created["vram_needed_gb"] = vram["gb"]; created["sized_for"] = vram["why"]
    return created


BRAIN_PROFILE = {"vram_gb": 48, "dlperf": 140, "cpu_ram_gb": 48, "cpu_cores": 24,
                 "disk_gb": 40, "inet_down": 500, "compute_cap": 800, "price": 1.0}

# On-start bootstrap: a freshly provisioned box has NO LLM server. This installs Ollama, binds it to
# 0.0.0.0:11434 (so the Hostinger tunnel can reach it), and pulls the brain's model ladder — so the box
# self-heals into a working brain on boot with no manual SSH. Idempotent + survives reboots (setsid +
# the wait-for-serve loop). Must finish the FULL installer before `serve`, else llama-server is missing
# and Ollama falls back to CPU-only. Models pull in the background so /api/tags answers fast.
BRAIN_MODELS = os.environ.get("BRAIN_MODELS", "llama3.1:8b qwen2.5:32b nomic-embed-text")
BRAIN_ONSTART = r"""#!/bin/bash
export HOME=/root
command -v ollama >/dev/null 2>&1 || { curl -fsSL https://ollama.com/install.sh -o /root/ollama_install.sh && sh /root/ollama_install.sh; }
pkill -x ollama 2>/dev/null; sleep 1   # -x (exact comm), NOT -f 'ollama serve' — the latter matches THIS script's own cmdline and self-kills
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_KEEP_ALIVE=24h OLLAMA_MAX_LOADED_MODELS=3 OLLAMA_FLASH_ATTENTION=1 setsid ollama serve >/tmp/ollama.log 2>&1 </dev/null &
for i in $(seq 1 30); do curl -sf -m2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 2; done
for m in %s; do ollama pull "$m"; done
echo BRAIN_READY
""" % BRAIN_MODELS


def provision_brain(max_price: float = None) -> dict:
    """Create the PERSISTENT brain box: cheapest box matching the 3090×4-class brain profile (48GB VRAM,
    strong DL-perf, modern CUDA). The on-start bootstrap installs Ollama, binds it to 0.0.0.0:11434, and
    pulls the model ladder so the box comes up as a working brain with no manual setup. User-initiated
    (it bills), labelled jarvis-brain."""
    g = _guard()
    if g: return g
    off = cheapest_similar(BRAIN_PROFILE, max_price=max_price or 1.0)
    if not off.get("ok"):
        return off
    r = create_instance(off["offer"]["id"], image=os.environ.get("BRAIN_IMAGE", "vastai/sglang:v0.5.12-cuda-13.0"),
                        label="jarvis-brain", disk_gb=40, onstart=BRAIN_ONSTART)
    if r.get("ok"):
        r["offer"] = off["offer"]
    return r


# ── JARVIS brain: detect a running GPU instance serving an LLM (ollama), point JARVIS at it ──────────
def brain_instance() -> dict:
    """Find a RUNNING instance that can host the LLM brain (the GPU box), so JARVIS can flip from local
    replies to full AI. Returns the instance + its ollama endpoint hint."""
    g = _guard()
    if g: return g
    insts = list_instances().get("instances") or []
    running = [i for i in insts if "running" in (i.get("status") or "")]
    if not running:
        return {"ok": True, "brain": None, "stopped": [i for i in insts if i.get("id")][:3]}
    running.sort(key=lambda i: -(i.get("num_gpus") or 1))   # biggest box = the brain
    b = running[0]
    return {"ok": True, "brain": b, "endpoint": (b.get("ssh_host"), b.get("ssh_port"))}
