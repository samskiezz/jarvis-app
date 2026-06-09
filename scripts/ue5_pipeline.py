#!/usr/bin/env python3
"""UE5 render pipeline — the full build→deploy→stream run as ONE background job.

Writes a live status JSON (per-step status + ETA) that the backend serves at /v1/pipeline and the
Fleet Control panel polls. Build happens HERE (8-CPU box has the 150GB engine); only the slim
packaged build ships to the Vast 2×4090 box to render with Pixel Streaming. Each step is best-effort
and resilient — a failure is recorded and the run stops cleanly (the panel shows exactly where).

Run detached:  nohup python3 scripts/ue5_pipeline.py >/tmp/ue5_pipeline.log 2>&1 &
"""
from __future__ import annotations
import fcntl, glob, json, os, shutil, signal, subprocess, time

ROOT = "/opt/jarvis-app-1"
PROJ = f"{ROOT}/underworld/deploy/ue5-project"
UE = "/opt/UnrealEngine"
EDCMD = f"{UE}/Engine/Binaries/Linux/UnrealEditor-Cmd"
RUNUAT = f"{UE}/Engine/Build/BatchFiles/RunUAT.sh"
STATUS = f"{ROOT}/ue5_pipeline_status.json"
PIXELSTREAM = f"{ROOT}/underworld/deploy/pixelstream"
OUT = f"{PIXELSTREAM}/game"
LOCK = "/tmp/ue5_pipeline.lock"
MIN_FREE_GB = 15            # below this the cook is hopeless — fail clean instead of ENOSPC-crashing
HEARTBEAT_S = 20            # bump updated_at this often during long steps so the panel never freezes
KEY = os.path.expanduser("~/.ssh/id_ed25519")
VAST = "root@211.72.13.201"
SSH = (f"ssh -i {KEY} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "
       f"-o BatchMode=yes -p 41154 {VAST}")
UPROJECT = f"{PROJ}/Underworld_Render.uproject"
# Run the editor/cook as 'ueuser' (uid 1003) — the ESTABLISHED build user that owns the project, the
# engine Intermediate, AND a populated ~/.nuget cache. RunUAT validates its compiled-script-module
# records against ~/.nuget; running as any other user fails 0s in with "Permission denied" on
# /home/ueuser/.nuget. (The editor only refuses ROOT, so a regular user is fine.)
BUILDUSER = "ueuser"
BUILDUID = "1003"
RUNUSER = (f"runuser -u {BUILDUSER} -- env HOME=/home/{BUILDUSER} "
           f"XDG_RUNTIME_DIR=/run/user/{BUILDUID} "
           f"UE-LocalDataCachePath=/home/{BUILDUSER}/uddc")

# (id, label, rough ETA seconds — refined by actuals as steps finish)
STEPS = [
    ("mesh",     "Add a visible minion mesh (code)",            120),
    ("module",   "Compile the game module (with the mesh)",     1800),
    ("level",    "Author the UE5 level (sun · ground · minions)", 2400),
    ("package",  "Build + cook + package (Linux Shipping)",     10800),
    ("transfer", "Ship the build to the Vast 2×4090 box",        1200),
    ("vram",     "Free GPU VRAM on Vast (pause the LLM)",          60),
    ("stream",   "Launch Pixel Streaming on the 4090",           600),
]
STATE = {sid: {"status": "pending", "started": None, "ended": None, "detail": ""}
         for sid, _, _ in STEPS}
START = time.time()
OVERALL = None  # explicit overall-status override — e.g. the build is done but the Vast/stream tail is
                # gated, so the run exits cleanly as "ready" (not a misleading "running" that the
                # staleness check would later flip to "stalled").


def write():
    total = sum(e for _, _, e in STEPS) or 1
    done_est = sum(e for sid, _, e in STEPS if STATE[sid]["status"] == "done")
    remaining = 0.0
    for sid, _, e in STEPS:
        st = STATE[sid]
        if st["status"] == "pending":
            remaining += e
        elif st["status"] == "running":
            remaining += max(0.0, e - (time.time() - (st["started"] or time.time())))
    failed = any(STATE[sid]["status"] == "failed" for sid, _, _ in STEPS)
    all_done = all(STATE[sid]["status"] == "done" for sid, _, _ in STEPS)
    payload = {
        "name": "Underworld → UE5 render",
        "pid": os.getpid(),                       # consumer checks liveness to detect a dead run
        "started_at": START, "updated_at": time.time(),
        "overall_pct": 100 if OVERALL in ("ready", "done") else int(100 * done_est / total),
        "eta_s": 0 if OVERALL else int(remaining),
        "status": OVERALL or ("failed" if failed else ("done" if all_done else "running")),
        "steps": [{"id": sid, "label": label, "est_s": e, **STATE[sid]} for sid, label, e in STEPS],
    }
    tmp = STATUS + ".tmp"
    try:                                          # never let a full disk abort the pipeline
        with open(tmp, "w") as f:
            json.dump(payload, f, indent=2)
        os.replace(tmp, STATUS)
    except OSError:
        pass


def _killtree(proc):
    """Kill the whole process group — UBT/clang/RunUAT/cook grandchildren, not just the shell."""
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
        time.sleep(5)
        os.killpg(pgid, signal.SIGKILL)
    except Exception:  # noqa: BLE001
        pass


def _tail(path, n=400):
    try:
        with open(path, errors="ignore") as f:
            return f.read().strip()[-n:]
    except Exception:  # noqa: BLE001
        return ""


def run(sid, cmd, timeout=None):
    """Run a step in its own session (process group) with a per-step log file and a heartbeat, so a
    multi-hour cook keeps updated_at moving (the panel never freezes) and an outer-timeout reaps the
    WHOLE tree instead of orphaning grandchildren that keep burning CPU/disk."""
    STATE[sid]["status"] = "running"; STATE[sid]["started"] = time.time()
    STATE[sid]["detail"] = ""; write()
    logpath = f"/tmp/ue5_pipeline.{sid}.log"
    try:
        logfh = open(logpath, "w")
        proc = subprocess.Popen(cmd, shell=True, stdout=logfh, stderr=subprocess.STDOUT,
                                cwd=PROJ, start_new_session=True)
        deadline = (time.time() + timeout) if timeout else None
        while True:
            try:
                proc.wait(timeout=HEARTBEAT_S)
                break
            except subprocess.TimeoutExpired:
                write()  # heartbeat — bumps updated_at + counts the ETA down during the long cook
                if deadline and time.time() > deadline:
                    _killtree(proc)
                    STATE[sid]["status"] = "failed"
                    STATE[sid]["detail"] = f"timed out after {timeout}s\n" + _tail(logpath)
                    STATE[sid]["ended"] = time.time(); write()
                    logfh.close()
                    return False
        logfh.close()
        STATE[sid]["detail"] = _tail(logpath)
        STATE[sid]["status"] = "done" if proc.returncode == 0 else "failed"
    except Exception as e:  # noqa: BLE001
        STATE[sid]["status"] = "failed"; STATE[sid]["detail"] = str(e)[-300:]
    STATE[sid]["ended"] = time.time(); write()
    return STATE[sid]["status"] == "done"


def mark_done(sid, detail):
    """Force a step to 'done' — used when its OUTPUT already exists (resume) or when the tool wrote
    its artifact but then crashed on exit (the UE editor/cook FPE-on-shutdown under -nullrhi)."""
    STATE[sid]["status"] = "done"; STATE[sid]["detail"] = detail
    STATE[sid]["started"] = STATE[sid].get("started") or time.time()
    STATE[sid]["ended"] = time.time(); write()


def archive_ok():
    """True ONLY when the cook produced a real, runnable Linux client — a regular executable FILE of
    real size, never the staging DIRECTORY that UE names after the project (which exists before the
    binary lands). The Shipping target 'Underworld' yields a DECORATED exe 'Underworld-Linux-Shipping';
    the supported launcher is '<uproject>.sh' (Underworld_Render.sh). A bare 'Underworld' file is
    accepted too (undecorated configs) but only above a real-binary size floor."""
    for nm in ("Underworld-Linux-Shipping", "UnderworldClient-Linux-Shipping",
               "Underworld", "UnderworldClient"):
        for h in glob.glob(f"{OUT}/**/{nm}", recursive=True):
            if os.path.isfile(h) and os.path.getsize(h) > 1_000_000:   # client exe is tens of MB
                return True
    for h in glob.glob(f"{OUT}/**/*.sh", recursive=True):              # staged launcher wrapper
        if os.path.isfile(h) and os.path.basename(h).lower().startswith("underworld"):
            return True
    return False


def find_launcher_cmd():
    """Remote shell snippet that locates the staged launcher/exe on the Vast box and fails LOUDLY if
    nothing real is there (so we never exec an empty path on the shared GPU)."""
    return (
        'cd /root/uw_build && '
        'BIN=$(find . \\( -name "Underworld_Render.sh" -o -name "Underworld.sh" \\) -type f | head -1); '
        '[ -n "$BIN" ] || BIN=$(find . -name "Underworld-Linux-Shipping" -type f | head -1); '
        '[ -n "$BIN" ] || BIN=$(find . -name "Underworld" -type f -size +1M | head -1); '
        '[ -n "$BIN" ] || { echo "FATAL: no Underworld binary in /root/uw_build"; exit 1; }; '
        'chmod +x "$BIN"; '
        'nohup "$BIN" -RenderOffScreen -PixelStreamingIP=0.0.0.0 -PixelStreamingPort=8888 '
        '-AudioMixer -UnderworldApiUrl=http://76.13.176.135:8091 '
        '>/root/uw_stream.log 2>&1 & echo launched pid $!'
    )


def main():
    # Single-instance lock — a second driver (e.g. a double-pressed button) is a clean no-op even if
    # it slips past the endpoint's pgrep check. Auto-releases when this process exits/dies.
    lock_fd = os.open(LOCK, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another ue5_pipeline.py already holds the lock — exiting")
        raise SystemExit(0)

    write()
    os.system(f"chown -R {BUILDUSER}:{BUILDUSER} {PROJ} 2>/dev/null")
    # The cook runs as BUILDUSER and writes the archive into OUT — make the whole tree BUILDUSER-writable
    # FIRST (create as root, then chown so nothing is left root-owned and unwritable).
    os.makedirs(OUT, exist_ok=True)
    os.system(f"chown -R {BUILDUSER}:{BUILDUSER} {PIXELSTREAM} 2>/dev/null")
    # UE5.5's cook uses the Zen storage server, which talks over POSIX shared memory. A stale
    # /dev/shm object owned by a DIFFERENT user makes BUILDUSER's ZenServer crash with "Could not
    # open a shared memory object: Permission denied" (it can't resize an object it doesn't own).
    # Clear them and provide the XDG runtime dir the session needs.
    os.system("rm -f /dev/shm/UnrealEngine* /dev/shm/Zen* 2>/dev/null")
    os.makedirs(f"/run/user/{BUILDUID}", exist_ok=True)
    os.system(f"chown {BUILDUSER}:{BUILDUSER} /run/user/{BUILDUID} 2>/dev/null; "
              f"chmod 700 /run/user/{BUILDUID} 2>/dev/null")

    # 1) a visible default mesh on the crowd minion (the project ships an empty SkeletalMeshComponent)
    run("mesh", f"python3 {ROOT}/scripts/ue5_add_minion_mesh.py", timeout=120)

    # 1b) recompile the editor module so it picks up the new mesh (the editor won't load a stale .so).
    # UBT (the C++ build) has no refuse-root check — run as ROOT so it can chmod the bundled toolchain
    # (the non-root user can't touch the root-owned engine tools). The .so is world-readable for the
    # editor (uebuild) to load.
    if STATE["mesh"]["status"] == "done":
        run("module",
            f'{UE}/Engine/Build/BatchFiles/Linux/Build.sh UnderworldEditor Linux '
            f'Development -project="{UPROJECT}" -waitmutex', timeout=3600)

    # 2) author the level with the full headless editor (-ExecutePythonScript has the level subsystems).
    # Under -nullrhi the editor frequently FPE-crashes on SHUTDOWN *after* saving the map, so the saved
    # .umap — not the exit code — is the real success signal. Skip outright if it's already there (resume).
    UMAP = f"{PROJ}/Content/Maps/Underworld.umap"
    if STATE["module"]["status"] == "done":
        if os.path.exists(UMAP):
            mark_done("level", "level already authored (Underworld.umap present) — skipped")
        else:
            run("level",
                f'{RUNUSER} timeout 3000 {EDCMD} "{UPROJECT}" '
                f'-ExecutePythonScript="{ROOT}/scripts/ue5_make_level.py" '
                f"-unattended -nullrhi -nosplash -nosound", timeout=3100)
            if STATE["level"]["status"] != "done" and os.path.exists(UMAP):
                mark_done("level", "map saved despite editor exit-crash — accepted")

    # 3) package a Linux Shipping client. Split the build from the cook: UBT builds as ROOT (only root
    # can chmod the engine's bundled toolchain — same wall the module step hit), then the cook runs as
    # uebuild with -skipbuild (the cook commandlet, like the editor, refuses root). The archived binary
    # is the success signal — the cook can also crash on exit after writing a complete archive.
    if STATE["level"]["status"] == "done":
        if archive_ok():
            mark_done("package", "packaged client already present — skipped")
        else:
            free_gb = shutil.disk_usage(ROOT).free / 2**30
            if free_gb < MIN_FREE_GB:
                STATE["package"]["status"] = "failed"
                STATE["package"]["detail"] = (f"insufficient disk: {free_gb:.0f}GB free, "
                                              f"need ≥{MIN_FREE_GB}GB for the cook")
                STATE["package"]["started"] = STATE["package"]["ended"] = time.time(); write()
            else:
                # clear stale staging so a prior partial archive can't masquerade as success (Intermediate
                # is kept — it holds the compiled module and wiping it would force a full rebuild)
                shutil.rmtree(f"{PROJ}/Saved/StagedBuilds", ignore_errors=True)
                for p in glob.glob(f"{OUT}/*"):
                    shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else os.remove(p)
                # A prior cook that crashed (the Zen Signal-11) can ORPHAN its AutomationTool/editor,
                # which keeps holding the UAT single-instance mutex → the next cook dies 0s in with
                # "A conflicting instance of AutomationTool is already running". Reap those orphans and
                # clear the mutex + Zen/trace shm so the cook starts clean. (None of these names appear
                # in this driver's own cmdline, so the pkills can't self-match.)
                os.system("pkill -9 -f 'AutomationTool.dll' 2>/dev/null; "
                          "pkill -9 -f 'UnrealEditor-Cmd' 2>/dev/null; "
                          "pkill -9 -f 'zenserver' 2>/dev/null")
                os.system("rm -f /tmp/.dotnet/shm/global/AutomationTool_* 2>/dev/null; "
                          "rm -f /dev/shm/UnrealEngine* /dev/shm/Zen* /dev/shm/UnrealTraceServer 2>/dev/null")
                time.sleep(2)
                # -ddc=NoZenLocalFallback: UE5.5's default DDC auto-launches a ZenServer child and waits
                # on it over a named event; under runuser that handshake never completes → fatal in
                # DerivedDataBackends.cpp → Signal 11. This graph drops the Zen local store and uses the
                # filesystem DDC (UE-LocalDataCachePath), so no ZenServer is needed.
                run("package",
                    f'{UE}/Engine/Build/BatchFiles/Linux/Build.sh Underworld Linux Shipping '
                    f'-project="{UPROJECT}" -waitmutex && '
                    f'{RUNUSER} timeout 42000 {RUNUAT} BuildCookRun -project="{UPROJECT}" -noP4 '
                    f'-utf8output -platform=Linux -targetplatform=Linux -clientconfig=Shipping '
                    f'-nocompileeditor -skipbuild -cook -ddc=NoZenLocalFallback -unattended '
                    f'-map=Underworld -stage -pak -archive -archivedirectory="{OUT}"', timeout=43200)
                if STATE["package"]["status"] != "done" and archive_ok():
                    mark_done("package", "archive present despite cook exit-crash — accepted")

    # Steps 4-6 touch the SHARED Vast box + pause the live LLM — gated behind explicit approval
    # (UE5_DEPLOY=1, set only when the operator presses "DEPLOY TO GPU" on the panel). They also
    # re-verify a REAL binary exists (archive_ok) before any Vast/Ollama action, so a partial/stale
    # archive can never ship a broken build or pause the shared LLM for nothing.
    if os.environ.get("UE5_DEPLOY") != "1":
        global OVERALL
        for sid in ("transfer", "vram", "stream"):
            STATE[sid]["detail"] = "awaiting GPU-deploy approval (press DEPLOY TO GPU)"
        # 'ready' iff the local build actually produced a runnable client; otherwise leave the real
        # failed/running status so the panel shows where it broke.
        OVERALL = "ready" if (STATE["package"]["status"] == "done" and archive_ok()) else None
        write()
        return

    if not (STATE["package"]["status"] == "done" and archive_ok()):
        for sid in ("transfer", "vram", "stream"):
            STATE[sid]["status"] = "failed"
            STATE[sid]["detail"] = "no runnable packaged client — refusing to touch the shared GPU box"
        write()
        return

    # 4) ship the slim build to the Vast box
    run("transfer",
        f'rsync -az --delete -e "ssh -i {KEY} -o StrictHostKeyChecking=no '
        f'-o UserKnownHostsFile=/dev/null -o BatchMode=yes -p 41154" '
        f'"{OUT}/" {VAST}:/root/uw_build/', timeout=7200)

    # 5) free VRAM on the Vast box (pause Ollama) so UE5 + NVENC fit
    if STATE["transfer"]["status"] == "done":
        run("vram", f"{SSH} 'pkill -STOP ollama 2>/dev/null; supervisorctl stop ollama 2>/dev/null; "
                    f"nvidia-smi --query-gpu=memory.used --format=csv,noheader || true'", timeout=120)

    # 6) launch the packaged build with Pixel Streaming on the 4090
    if STATE["vram"]["status"] == "done":
        run("stream", f"{SSH} '{find_launcher_cmd()}'", timeout=600)

    write()


if __name__ == "__main__":
    main()
