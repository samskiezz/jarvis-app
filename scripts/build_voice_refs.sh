#!/usr/bin/env bash
# Build clean XTTS reference clips for the JARVIS/Alfred voice from the owner's master recording.
#
# Research-backed (see .proof_jarvis_research voice notes): 5-6 clean ~12s clips, mono 22050Hz,
# light denoise + high-pass + EBU-R128 loudness-normalize, then an OPTIONAL formant-preserving
# pitch shift to make the voice lower/older. XTTS clones whatever is in the references, so the
# pitch is baked in here (consistent across the streaming AND full-synth paths, no runtime cost).
#
# Usage:
#   SEMITONES=-3 scripts/build_voice_refs.sh                 # rebuild refs at -3 semitones (default)
#   SEMITONES=-2 scripts/build_voice_refs.sh                 # a touch higher
#   SEMITONES=0  scripts/build_voice_refs.sh                 # natural pitch (no shift)
# Then deploy to the GPU box + restart the voice service with scripts/deploy_voice_refs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MASTER="${MASTER:-server/voices/raw_user/master_recording.input}"
OUT="${OUT:-server/voices/ref}"
SEMITONES="${SEMITONES:--3}"          # lower = older/deeper. -3 ≈ mature, lower; beyond -5 gets unnatural.
CLIP_LEN="${CLIP_LEN:-12}"

[ -f "$MASTER" ] || { echo "master recording not found: $MASTER"; exit 1; }

# pitch ratio = 2^(semitones/12)
RATIO=$(python3 -c "print(f'{2**($SEMITONES/12):.6f}')")
echo "[build_voice_refs] master=$MASTER  semitones=$SEMITONES  pitch_ratio=$RATIO  clip_len=${CLIP_LEN}s"

# Start times (s) of clean, continuous speech runs picked from the master's silence map.
STARTS=(13 38 60 135 250 470)

mkdir -p "$OUT"
rm -f "$OUT"/user_0*.wav
i=1
for st in "${STARTS[@]}"; do
  out=$(printf "%s/user_%02d.wav" "$OUT" "$i")
  ffmpeg -hide_banner -loglevel error -ss "$st" -t "$CLIP_LEN" -i "$MASTER" \
    -af "afftdn=nf=-25, highpass=f=70, loudnorm=I=-18:TP=-2:LRA=11, rubberband=pitch=${RATIO}:formant=preserved" \
    -ar 22050 -ac 1 -sample_fmt s16 "$out"
  dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$out")
  printf "[build_voice_refs] %s  (%.1fs)\n" "$(basename "$out")" "$dur"
  i=$((i+1))
done
echo "[build_voice_refs] done — $((i-1)) clips in $OUT"
