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
                "price": round(float(it.get("dph_total") or 0), 3),
                "image": it.get("image_uuid") or it.get("image"),
                "ssh_host": it.get("ssh_host"), "ssh_port": it.get("ssh_port"),
                "gpu_util": it.get("gpu_util"), "label": it.get("label"),
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
    off = cheapest_offer(gpu_name=src.get("gpu"), max_price=max_price)
    if not off.get("ok"):
        return off
    new = create_instance(off["offer"]["id"], image=src.get("image"),
                          label="jarvis-gpu-copy", disk_gb=DEFAULT_DISK_GB)
    new["copied_from"] = int(instance_id)
    new["data_recouped"] = bool(recoup.get("ok"))
    new["recoup_dir"] = recoup.get("dest")
    return new


def safe_dispose(instance_id: int) -> dict:
    """RECOUP-THEN-DESTROY: sync the full /workspace (results + any saved checkpoints / VRAM-dumped state)
    down to Hostinger, THEN destroy. Nothing is ever destroyed without first recouping everything."""
    g = _guard()
    if g: return g
    recoup = sync_results(int(instance_id), "/workspace")
    if not recoup.get("ok"):
        return {"ok": False, "error": "REFUSED to destroy — recoup failed (" + str(recoup.get("error") or recoup.get("stderr") or "")[:120] + "). Data not lost; try Save→Hostinger then dispose.", "recoup": recoup}
    d = destroy_instance(int(instance_id))
    d["recouped_to"] = recoup.get("dest")
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
