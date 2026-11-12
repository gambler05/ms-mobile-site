#!/usr/bin/env bash
# Reconstruit le Reel complet : images → audio → master + version sans musique + couverture.
set -euo pipefail
cd "$(dirname "$0")"
TMP="${TMPDIR:-/tmp}/vertige-frames"; rm -rf "$TMP"; mkdir -p "$TMP" out/stems
node render.mjs "$TMP"
python3 audio.py out/stems
V="-c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -profile:v high -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart"
A="-c:a aac -b:a 256k -ar 48000"
ffmpeg -y -loglevel error -framerate 30 -i "$TMP/f_%05d.png" -i out/stems/mix.wav $V $A -shortest out/vertige-reel05-master.mp4
ffmpeg -y -loglevel error -i out/vertige-reel05-master.mp4 -i out/stems/sfx.wav -map 0:v -map 1:a -c:v copy $A out/vertige-reel05-sans-musique.mp4
node render.mjs "$TMP/stills" --stills 0 && ffmpeg -y -loglevel error -i "$TMP/stills/cover.png" -q:v 2 out/cover.jpg
rm -rf "$TMP" out/stems/mix.wav
echo "OK → out/"
