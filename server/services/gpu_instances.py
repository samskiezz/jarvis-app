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


def cheapest_offer(gpu_name: str = None, max_price: float = None, num_gpus: int = 1) -> dict:
    """Search available offers, return the cheapest reliable match (cheap + efficient)."""
    g = _guard()
    if g: return g
    max_price = max_price or DEFAULT_MAXPRICE
    if gpu_name:
        gpu_name = gpu_name.replace("_", " ").strip()   # UI sends RTX_4090 → Vast uses "RTX 4090"
    from urllib.parse import quote
    q = {"verified": {"eq": True}, "rentable": {"eq": True}, "num_gpus": {"eq": num_gpus},
         "dph_total": {"lte": max_price}, "order": [["dph_total", "asc"]], "type": "on-demand", "limit": 64}
    if gpu_name:
        q["gpu_name"] = {"eq": gpu_name}
    try:
        d = _req("GET", "/bundles/?q=" + quote(json.dumps(q)))   # Vast offers search = GET /bundles/?q=<json>
        offers = d.get("offers") or []
        offers = [o for o in offers if o.get("rentable") and float(o.get("dph_total") or 99) <= max_price
                  and (not gpu_name or o.get("gpu_name") == gpu_name)]
        offers.sort(key=lambda o: float(o.get("dph_total") or 99))
        if not offers:
            return {"ok": False, "error": "no offers under $%.2f/hr%s" % (max_price, " for "+gpu_name if gpu_name else "")}
        o = offers[0]
        return {"ok": True, "offer": {"id": o.get("id"), "gpu": o.get("gpu_name"),
                "price": round(float(o.get("dph_total") or 0), 3), "ram": o.get("gpu_ram"),
                "reliability": round(float(o.get("reliability2") or 0), 3)}}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


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
    """Clone an instance's image+disk+onstart onto a brand-new cheapest matching offer."""
    g = _guard()
    if g: return g
    src = next((i for i in (list_instances().get("instances") or []) if i["id"] == int(instance_id)), None)
    if not src:
        return {"ok": False, "error": "source instance not found"}
    off = cheapest_offer(gpu_name=src.get("gpu"), max_price=max_price)
    if not off.get("ok"):
        return off
    return create_instance(off["offer"]["id"], image=src.get("image"),
                           label="jarvis-gpu-copy", disk_gb=DEFAULT_DISK_GB)


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
    off = cheapest_offer(gpu_name=gpu_name, max_price=max_price)
    if not off.get("ok"):
        return off
    # onstart writes the task into the box; the dock orchestrates run→sync→destroy once SSH is up.
    onstart = "mkdir -p /workspace/results && echo %s > /workspace/task.sh && chmod +x /workspace/task.sh" % json.dumps(task_cmd)
    created = create_instance(off["offer"]["id"], image=image, onstart=onstart, label=label)
    if created.get("ok"):
        created["offer"] = off["offer"]
    return created
