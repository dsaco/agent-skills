#!/usr/bin/env bash
# Cut the second pass [loop-seconds, 2 * loop-seconds) out of a double-loop render.
set -euo pipefail

usage() {
  echo "Usage: $0 <double-loop.wav> <output.wav> <loop-seconds> [sample-rate]" >&2
  exit 64
}

[[ $# -ge 3 && $# -le 4 ]] || usage
input=$1
output=$2
loop_seconds=$3
sample_rate=${4:-48000}

[[ $loop_seconds =~ ^[0-9]+([.][0-9]+)?$ ]] || usage
[[ $sample_rate =~ ^[0-9]+$ ]] || usage
[[ -f "$input" ]] || { echo "Input not found: $input" >&2; exit 66; }
[[ ! -e "$output" ]] || { echo "Output already exists: $output (choose a new file name)" >&2; exit 73; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is required." >&2; exit 69; }
command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe is required." >&2; exit 69; }

input_duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")
required=$(awk -v n="$loop_seconds" 'BEGIN { printf "%.9f", n * 2 }')
if ! awk -v got="$input_duration" -v need="$required" 'BEGIN { exit !(got + 0.002 >= need) }'; then
  echo "Double-loop render is too short: ${input_duration}s; need about ${required}s." >&2
  exit 65
fi

# Keep the input PCM format (Strudel exports 16-bit); anything else becomes 16-bit PCM.
codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$input")
case "$codec" in
  pcm_s16le|pcm_s24le|pcm_s32le|pcm_f32le) ;;
  *) codec=pcm_s16le ;;
esac

mkdir -p "$(dirname "$output")"
# Decode first, then trim on the audio timeline for a sample-accurate boundary.
ffmpeg -hide_banner -loglevel error -n -i "$input" \
  -af "atrim=start=${loop_seconds}:end=${required},asetpts=PTS-STARTPTS,aresample=${sample_rate}:first_pts=0" \
  -ar "$sample_rate" -ac 2 -c:a "$codec" "$output"

echo "Created: $output"
