#!/usr/bin/env python3
"""
JARVIS local voice-cloning pipeline (free / open-source / no paid APIs).

Takes the user's raw voice recordings (server/voices/raw_user/*.mp3|m4a|wav),
cleans + segments them with ffmpeg, picks the best clips, installs them as the
XTTS-v2 reference set, and restarts the clone service so JARVIS speaks in the
user's OWN voice.

Why ffmpeg-only for the core path: XTTS-v2 cloning is REFERENCE-BASED — it
conditions directly on a few clean audio clips, no transcript or training run
needed. So denoise → loudness-normalise → silence-split → pick best 3-6 clips
→ refs is the whole job, and it runs anywhere ffmpeg runs (no GPU, no ML deps).

Optional (only if installed, for FUTURE fine-tuning, never required here):
  faster-whisper → transcripts + metadata.csv  (pip install faster-whisper)

Usage:
  python3 scripts/voice_pipeline.py            # process everything in raw_user/
  python3 scripts/voice_pipeline.py --no-restart
"""
import argparse
import os, sys, re, json, shutil, subprocess, datetime

ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR   = os.path.join(ROOT, "server", "voices", "raw_user")
WORK_DIR  = os.path.join(ROOT, "server", "voices", "dataset")
REF_DIR   = os.path.join(ROOT, "server", "voices", "ref")
QC_PATH   = os.path.join(ROOT, "server", "voices", "QC_REPORT.md")
CACHE_DIR = os.path.join(ROOT, "server", "voices", "clone_cache")

# XTTS likes ~6-12s clean clips at 24 kHz mono. We keep the best few as refs.
TARGET_SR   = 24000
MIN_CLIP    = 3.0      # seconds — XTTS conditions fine from ~3s; shorter = unstable
MAX_CLIP    = 12.0     # seconds — XTTS conditioning sweet spot
MAX_REFS    = 6        # how many clips become the active reference set
SIL_DB      = "-32dB"  # below this = silence
SIL_MINLEN  = 0.45     # seconds of silence to split on


def _run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def _dur(path):
    r = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
              "-of", "default=nw=1:nk=1", path])
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def _clean_to_wav(src, dst):
    """mp3/m4a/wav -> denoised, de-hummed, loudness-normalised mono 24k WAV."""
    # highpass 70 (kill rumble/AC hum) · lowpass 8500 (hiss) · afftdn (broadband denoise)
    # · loudnorm (EBU R128 to a calm, consistent level) — all standard ffmpeg, no plugins.
    af = ("highpass=f=70,lowpass=f=8500,afftdn=nf=-25,"
          "loudnorm=I=-18:TP=-2:LRA=11,dynaudnorm=p=0.9:m=10")
    r = _run(["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", str(TARGET_SR),
              "-af", af, dst])
    return r.returncode == 0 and os.path.exists(dst)


def _silence_cuts(wav):
    """Return [(start,end), ...] speech spans using ffmpeg silencedetect."""
    r = _run(["ffmpeg", "-i", wav, "-af",
              f"silencedetect=noise={SIL_DB}:d={SIL_MINLEN}", "-f", "null", "-"])
    log = r.stderr
    starts = [float(m) for m in re.findall(r"silence_start: ([0-9.]+)", log)]
    ends   = [float(m) for m in re.findall(r"silence_end: ([0-9.]+)", log)]
    total  = _dur(wav)
    # speech = the gaps BETWEEN silences
    spans, cur = [], 0.0
    for i, s in enumerate(starts):
        if s > cur:
            spans.append((cur, s))
        cur = ends[i] if i < len(ends) else total
    if cur < total:
        spans.append((cur, total))
    # split long spans into <=MAX_CLIP windows; drop <MIN_CLIP
    out = []
    for a, b in spans:
        ln = b - a
        if ln < MIN_CLIP:
            continue
        n = max(1, int(ln // MAX_CLIP) + (1 if ln % MAX_CLIP > MIN_CLIP else 0))
        step = ln / n
        for k in range(n):
            cs, ce = a + k * step, min(b, a + (k + 1) * step)
            if ce - cs >= MIN_CLIP:
                out.append((round(cs, 2), round(ce, 2)))
    return out


def _cut(wav, start, end, dst):
    r = _run(["ffmpeg", "-y", "-i", wav, "-ss", str(start), "-to", str(end),
              "-c", "copy", dst])
    if r.returncode != 0 or not os.path.exists(dst):  # copy can fail on odd boundaries
        r = _run(["ffmpeg", "-y", "-i", wav, "-ss", str(start), "-to", str(end), dst])
    return os.path.exists(dst)


def _mean_volume(wav):
    r = _run(["ffmpeg", "-i", wav, "-af", "volumedetect", "-f", "null", "-"])
    m = re.search(r"mean_volume: (-?[0-9.]+) dB", r.stderr)
    return float(m.group(1)) if m else -99.0


def _maybe_transcribe(clips):
    """Optional faster-whisper transcripts → metadata.csv (only if installed)."""
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return None
    model = WhisperModel("base", device="cpu", compute_type="int8")
    rows = []
    for c in clips:
        segs, _ = model.transcribe(c["path"], language="en")
        txt = " ".join(s.text.strip() for s in segs).strip()
        c["text"] = txt
        rows.append(f"{os.path.basename(c['path'])}|{txt}")
    with open(os.path.join(WORK_DIR, "metadata.csv"), "w") as f:
        f.write("\n".join(rows))
    return len(rows)


def _parse_args(argv=None):
    p = argparse.ArgumentParser(description="JARVIS voice-clone pipeline")
    p.add_argument("--raw-dir", default=RAW_DIR, help="Directory containing raw user recordings")
    p.add_argument("--ref-dir", default=REF_DIR, help="Directory to install active reference clips")
    p.add_argument("--work-dir", default=WORK_DIR, help="Scratch working directory")
    p.add_argument("--cache-dir", default=CACHE_DIR, help="Synth cache directory to clear on restart")
    p.add_argument("--qc-path", default=QC_PATH, help="Where to write QC report")
    p.add_argument("--no-restart", action="store_true", help="Do not restart jarvis-voiceclone")
    return p.parse_args(argv)


def main(argv=None):
    global RAW_DIR, REF_DIR, WORK_DIR, QC_PATH, CACHE_DIR
    args = _parse_args(argv)
    RAW_DIR = args.raw_dir
    REF_DIR = args.ref_dir
    WORK_DIR = args.work_dir
    QC_PATH = args.qc_path
    CACHE_DIR = args.cache_dir
    no_restart = args.no_restart
    os.makedirs(RAW_DIR, exist_ok=True)
    raws = [os.path.join(RAW_DIR, f) for f in sorted(os.listdir(RAW_DIR))
            if f.lower().endswith((".mp3", ".m4a", ".wav", ".ogg", ".opus", ".aac", ".flac"))]
    if not raws:
        print(f"[voice_pipeline] no recordings in {RAW_DIR} — upload via /voiceupload first.")
        return 2

    if os.path.isdir(WORK_DIR):
        shutil.rmtree(WORK_DIR)
    os.makedirs(WORK_DIR)

    clips, rejected = [], []
    for src in raws:
        base = re.sub(r"[^a-zA-Z0-9]+", "_", os.path.splitext(os.path.basename(src))[0])
        clean = os.path.join(WORK_DIR, f"_clean_{base}.wav")
        if not _clean_to_wav(src, clean):
            rejected.append((os.path.basename(src), "clean/convert failed")); continue
        for i, (a, b) in enumerate(_silence_cuts(clean)):
            dst = os.path.join(WORK_DIR, f"{base}_{i:03d}.wav")
            if not _cut(clean, a, b, dst):
                continue
            vol = _mean_volume(dst)
            ln  = round(b - a, 2)
            if vol < -45:                       # near-silent / too quiet → reject
                rejected.append((os.path.basename(dst), f"too quiet {vol}dB")); os.remove(dst); continue
            clips.append({"path": dst, "len": ln, "vol": vol})
        try: os.remove(clean)
        except Exception: pass

    if not clips:
        print("[voice_pipeline] no usable clips after cleaning.")
        return 3

    # rank: prefer ~7-9s clips at a healthy level (closest to ideal length, loudest)
    def score(c):
        ideal = 8.0
        return -(abs(c["len"] - ideal)) + (c["vol"] / 10.0)
    clips.sort(key=score, reverse=True)
    best = clips[:MAX_REFS]

    n_tx = _maybe_transcribe(best)

    # install as the ACTIVE reference set (back up whatever's there)
    if os.path.isdir(REF_DIR) and os.listdir(REF_DIR):
        bak = REF_DIR + "_backup_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copytree(REF_DIR, bak)
    for f in os.listdir(REF_DIR):
        if f.endswith(".wav"):
            os.remove(os.path.join(REF_DIR, f))
    for i, c in enumerate(best):
        shutil.copy(c["path"], os.path.join(REF_DIR, f"user_{i+1:02d}.wav"))

    # QC report
    with open(QC_PATH, "w") as f:
        f.write(f"# JARVIS voice dataset — QC report\n\n")
        f.write(f"Generated: {datetime.datetime.now().isoformat(timespec='seconds')}\n\n")
        f.write(f"Source recordings: {len(raws)}  ·  usable clips: {len(clips)}  ·  "
                f"installed as refs: {len(best)}  ·  transcribed: {n_tx if n_tx is not None else 'skipped (no faster-whisper)'}\n\n")
        f.write("## Installed reference clips (the active voice)\n\n")
        f.write("| clip | length s | mean dB | transcript |\n|---|---|---|---|\n")
        for i, c in enumerate(best):
            f.write(f"| user_{i+1:02d}.wav | {c['len']} | {c['vol']} | {c.get('text','—')[:60]} |\n")
        if rejected:
            f.write("\n## Rejected (with reason)\n\n")
            for name, why in rejected[:60]:
                f.write(f"- {name} — {why}\n")
        f.write("\n## Naturalness next-steps\n")
        f.write("- For higher realism, record the extra script (varied emotion, questions, numbers, "
                "names, quiet/loud) — more clean clips = a more natural clone.\n")
    print(f"[voice_pipeline] installed {len(best)} reference clips → {REF_DIR}")
    print(f"[voice_pipeline] QC report → {QC_PATH}")

    if not no_restart:
        _run(["pm2", "restart", "jarvis-voiceclone"])
        # clear the old synth cache so new requests re-render in the new voice
        cache = CACHE_DIR
        if os.path.isdir(cache):
            for f in os.listdir(cache):
                if f.endswith(".wav"):
                    try: os.remove(os.path.join(cache, f))
                    except Exception: pass
        print("[voice_pipeline] clone service restarted on the new voice.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
