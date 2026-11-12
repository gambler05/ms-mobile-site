"""VERTIGE — ajoute une voix off à un Reel déjà rendu.

Usage : python3 voix.py reel-02
Lit   : <reel>/voix.json  (liste de {"t": début minimal en secondes, "dit": texte prononcé, "st": sous-titre})
        <reel>/out/stems/sfx.wav et music.wav, <reel>/out/vertige-<reel>-master.mp4 (image)
Écrit : <reel>/out/stems/voix.wav, <reel>/out/vertige-<reel>-voix.mp4, <reel>/out/vertige-<reel>-voix.srt

Voix : Piper « fr_FR-siwis-medium » (jeu de données SIWIS, licence CC-BY 4.0 — créditer en légende).
"""
import json, os, subprocess, sys, urllib.request, wave
import numpy as np

SR = 48000
VOICE = 'fr_FR-siwis-medium'
CACHE = os.path.expanduser('~/.cache/vertige-voix')
URL = f'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/{VOICE}'
SPEED = 1.0             # < 1 = plus rapide
GAP = 0.18              # silence minimal entre deux répliques

def model():
    os.makedirs(CACHE, exist_ok=True)
    for ext in ('.onnx', '.onnx.json'):
        p = os.path.join(CACHE, VOICE + ext)
        if not os.path.exists(p): urllib.request.urlretrieve(URL + ext, p)
    return os.path.join(CACHE, VOICE + '.onnx')

def read(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768
        return x.reshape(-1, w.getnchannels())

def write(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())

def say(text, tmp):
    raw, out = tmp + '.raw.wav', tmp + '.wav'
    subprocess.run([sys.executable, '-m', 'piper', '-m', model(), '--length-scale', str(SPEED), '-f', raw],
                   input=text.encode(), check=True, capture_output=True)
    fx = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'highpass=f=85,equalizer=f=220:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=2.5,'
          'acompressor=threshold=-20dB:ratio=3:attack=4:release=90:makeup=4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', fx, '-ar', str(SR), '-ac', '1', out], check=True)
    return read(out)[:, 0]

def stamp(s):
    h, m = int(s // 3600), int(s % 3600 // 60); return f'{h:02d}:{m:02d}:{s % 60:06.3f}'.replace('.', ',')

reel = sys.argv[1].rstrip('/'); name = os.path.basename(reel).replace('-', '')
out = os.path.join(reel, 'out'); lines = json.load(open(os.path.join(reel, 'voix.json'), encoding='utf-8'))
sfx, music = read(f'{out}/stems/sfx.wav'), read(f'{out}/stems/music.wav'); N = len(sfx)
voice = np.zeros(N); srt = []; cursor = 0.0
os.makedirs('/tmp/vertige-voix', exist_ok=True)
for i, l in enumerate(lines):
    x = say(l['dit'], f'/tmp/vertige-voix/l{i}')
    t0 = max(l['t'], cursor + GAP); t1 = t0 + len(x) / SR
    late = t0 - l['t']
    print(f"{t0:6.2f} → {t1:6.2f}  {'(décalée de %.2f s) ' % late if late > .01 else ''}{l['dit']}")
    if t1 > N / SR: sys.exit('La voix dépasse la fin de la vidéo.')
    a = int(t0 * SR); voice[a:a + len(x)] += x; cursor = t1
    srt.append(f"{i + 1}\n{stamp(t0)} --> {stamp(t1 + .15)}\n{l.get('st', l['dit'])}\n")

voice /= np.abs(voice).max() + 1e-9
# atténuation automatique : la musique et les effets s'effacent sous la voix
win = int(.012 * SR); level = np.sqrt(np.convolve(voice ** 2, np.ones(win) / win, 'same'))
gate = (level > .03).astype(float)
k = int(.22 * SR); gate = np.convolve(np.convolve(gate, np.ones(k) / k, 'same') > .02, np.hanning(int(.3 * SR)) / np.hanning(int(.3 * SR)).sum(), 'same')
duck = np.clip(gate, 0, 1)[:, None]
bed = music * .8 * (1 - .62 * duck) + sfx * (1 - .42 * duck)
mix = bed * .78 + (voice * .85)[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix *= .92 / np.abs(mix).max()
write(f'{out}/stems/voix.wav', (voice * .85)[:, None].repeat(2, 1)); write('/tmp/vertige-voix/mix.wav', mix)
open(f'{out}/vertige-{name}-voix.srt', 'w', encoding='utf-8').write('\n'.join(srt))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{out}/vertige-{name}-master.mp4', '-i', '/tmp/vertige-voix/mix.wav',
                '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart',
                f'{out}/vertige-{name}-voix.mp4'], check=True)
print('OK →', f'{out}/vertige-{name}-voix.mp4')
