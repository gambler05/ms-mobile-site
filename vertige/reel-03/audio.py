"""VERTIGE — Reel 03 : sound design 100 % synthétisé (aucun sample tiers).
Produit trois WAV 48 kHz stéréo : sfx.wav, music.wav, mix.wav.
Usage : python3 audio.py <dossier_sortie>
"""
import sys, wave
import numpy as np

SR, DUR = 48000, 29.5
N = int(SR * DUR)
rs = np.random.RandomState(11)

# --- repères (identiques à reel.html) ---
FALLS = [(2.8, 4.4, 0.55), (9.4, 12.4, 0.8), (17.6, 22.6, 1.0)]
Q2, Z2, SIL2 = 7.0, 7.5, 9.1
Q3, Z3, SIL3 = 15.0, 15.5, 17.2
END = 26.2

def env(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(d, 1e-4))

def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if sig.ndim == 1:
        sig = np.stack([sig * np.sqrt(.5 - pan / 2), sig * np.sqrt(.5 + pan / 2)], 1) * 1.414
    j = min(N, i + len(sig))
    if i < N: buf[i:j] += sig[: j - i] * gain

def bandnoise(n, f_lo, f_hi):
    """Bruit filtré (FFT) entre f_lo et f_hi."""
    x = rs.randn(n); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    m = np.exp(-0.5 * (np.log(np.maximum(f, 1) / np.sqrt(f_lo * f_hi)) / (np.log(f_hi / f_lo) / 2.2)) ** 2)
    y = np.fft.irfft(X * m, n); return y / (np.abs(y).max() + 1e-9)

def sweepnoise(n, fc):
    """Bruit dont la fréquence centrale suit fc[t] (fondu entre bandes fixes)."""
    centers = np.geomspace(120, 9000, 10); out = np.zeros(n); lf = np.log(fc)
    for c in centers:
        w = np.exp(-0.5 * ((lf - np.log(c)) / 0.42) ** 2)
        out += bandnoise(n, c / 1.5, c * 1.5) * w
    return out / (np.abs(out).max() + 1e-9)

def reverb(x, secs=1.6, mix=0.25):
    n = int(secs * SR); ir = rs.randn(n, 2) * np.exp(-np.arange(n) / SR * 5.5 / secs * 2)[:, None]
    ir[: int(.012 * SR)] = 0
    L = len(x) + n; out = np.zeros((L, 2))
    for ch in range(2):
        out[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch], L) * np.fft.rfft(ir[:, ch], L), L)
    out = out[: len(x)]; out /= (np.abs(out).max() + 1e-9)
    return x * (1 - mix * .3) + out * mix * np.abs(x).max()

# ------------------------------------------------------------------ briques
def tick(freq=2400, d=0.05):
    n = int(d * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * t) * .6 + bandnoise(n, 3000, 9000) * .4) * env(n, .001, d, 6)

def thump(f0=110, f1=45, d=0.28):
    n = int(d * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(np.sin(ph) * 1.6) * env(n, .002, d, 5)

def impact(power=1.0):
    d = 2.2; n = int(d * SR); t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t * 16); sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (3.2 - power))
    crack = bandnoise(n, 300, 5000) * np.exp(-t * 26) * .8
    body = bandnoise(n, 60, 400) * np.exp(-t * 7) * .5
    return np.tanh((sub * 1.3 + crack + body) * (1 + power)) * .9

def whoosh(d, f_a, f_b, peak=0.6):
    n = int(d * SR); u = np.arange(n) / n
    fc = f_a * (f_b / f_a) ** u
    e = np.exp(-0.5 * ((u - peak) / 0.22) ** 2)
    return sweepnoise(n, fc) * e

def riser(d):
    n = int(d * SR); u = np.arange(n) / n
    noise = sweepnoise(n, 300 * (20 ** u)) * u ** 2.2
    f = 110 * 2 ** (u * 2.0); ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + .5 * np.sin(2.005 * ph)) * u ** 3 * .35
    trem = 1 - .35 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 22 * u ** 2) / SR)) * u
    return (noise * .8 + tone) * trem

def fall(d, power):
    """La chute : glissando descendant façon Shepard + vent dont l'intensité suit la vitesse."""
    n = int(d * SR); u = np.arange(n) / n
    e = np.where(u < .5, 4 * u ** 3, 1 - (-2 * u + 2) ** 3 / 2)
    speed = np.sin(np.pi * e) ** 1.2
    out = np.zeros(n)
    for k in range(5):                                  # voix à l'octave qui descendent sans fin
        pos = (k / 5 - e * (1.2 + power)) % 1.0
        f = 70 * 2 ** (pos * 5)
        amp = np.sin(np.pi * pos) ** 2
        out += np.sin(2 * np.pi * np.cumsum(f) / SR) * amp
    wind = sweepnoise(n, 2600 * (0.12 ** e) + 150) * speed
    edge = np.minimum(1, u * 14) * np.minimum(1, (1 - u) * 40)
    return (out * .16 * speed + wind * .75) * edge

def bell(freq, d=2.6):
    n = int(d * SR); t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 6) * 2.2
    return (np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 2.4) + .3 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 5)) * np.minimum(1, t / .004)

# ------------------------------------------------------------------ SFX
sfx = np.zeros((N, 2))
# la corde se trace autour du globe : glissando montant + frottement
n = int(1.2 * SR); u = np.arange(n) / n
tr = (np.sin(2 * np.pi * np.cumsum(180 * 2 ** (u * 1.6)) / SR) * .25 + sweepnoise(n, 500 * 8 ** u) * .6) * np.sin(np.pi * u) ** .6
place(sfx, tr, .1, .5)
for i in range(11): place(sfx, tick(2000 + i * 90, .035), .05 + i * .03, .14, pan=-.5 + i / 10)
place(sfx, thump(120, 46, .3), 1.3, .8); place(sfx, tick(2600, .06), 1.3, .3)                     # la boucle se ferme
for i in range(11): place(sfx, tick(2100 + (i % 3) * 250, .035), 3.3 + i * .03, .14)
place(sfx, whoosh(.35, 500, 3000, .7), 3.6, .3)
place(sfx, impact(.35), 3.9, .6)                                                                 # le mètre s'insère
for i in range(24): place(sfx, tick(2200 + (i % 4) * 200, .035), 5.0 + i * .03, .14, pan=(i % 5 - 2) / 4)
place(sfx, thump(90, 50, .3), 5.0, .5)
place(sfx, whoosh(.4, 500, 4000, .6), 6.45, .35)
place(sfx, fall(1.0, .7), 6.75, .8)                                                              # zoom jusqu'au sol
place(sfx, thump(80, 40, .35), 7.7, .55)
for g in (7.4, 8.1, 8.8):                                                                        # les paris, puis le trait qui les barre
    for i in range(10): place(sfx, tick(2300 + (i % 3) * 200, .03), g + i * .024, .13)
    place(sfx, whoosh(.28, 4000, 900, .4), g + .42, .34); place(sfx, tick(1300, .05), g + .62, .2)
place(sfx, riser(1.25), 8.75, .95)                                                               # montée → silence 10,0–10,4
place(sfx, whoosh(.3, 300, 2500, .8), 10.3, .5)
place(sfx, impact(.95), 10.52, 1.0)                                                              # 16 CM
place(sfx, whoosh(.5, 3000, 500, .3), 10.9, .18)
place(sfx, whoosh(.5, 800, 2600, .4), 12.15, .16); place(sfx, tick(2600, .04), 12.65, .12)
place(sfx, whoosh(.4, 500, 4000, .6), 14.5, .3)
place(sfx, fall(.75, .5)[::-1].copy(), 15.0, .7)                                                 # zoom arrière
for i in range(8): place(sfx, tick(2000 + i * 120, .035), 15.2 + i * .03, .14)
for i in range(17): place(sfx, tick(2300 + (i % 4) * 200, .035), 15.5 + i * .026, .13)
place(sfx, whoosh(.6, 2500, 600, .5), 15.75, .3); place(sfx, thump(150, 70, .2), 16.4, .5)       # le globe devient ballon
place(sfx, riser(1.15), 16.45, .95)                                                              # montée → silence 17,6–18,0
place(sfx, whoosh(.3, 300, 2500, .8), 17.9, .5)
place(sfx, impact(1.0), 18.14, 1.0)                                                              # 16 CM AUSSI
place(sfx, whoosh(.5, 800, 2600, .4), 19.55, .16)
place(sfx, thump(85, 42, .4), 22.5, .7)
for i in range(20): place(sfx, tick(2200 + (i % 3) * 250, .035), 22.5 + i * .03, .14)
for i in range(16): place(sfx, tick(1600 + i * 60, .03), 23.6 + i * .033, .15)                    # la formule s'imprime
place(sfx, whoosh(.5, 800, 2600, .4), 24.05, .14)
# carton de fin : aspiration + logo sonore (quinte descendante La4 → Ré4, puis Ré3)
place(sfx, whoosh(.7, 5000, 300, .55), END - .1, .4)
place(sfx, bell(440.0), END + .30, .30, pan=-.25)
place(sfx, bell(293.66), END + .62, .34, pan=.25)
place(sfx, bell(146.83, 3.0), END + .70, .30)
place(sfx, thump(73, 36, .8), END + .70, .55)
for i in range(7): place(sfx, tick(2400, .03), END + .7 + i * .05, .10)
place(sfx, tick(1800, .05), END + 1.7, .14)
sfx = reverb(sfx, 1.8, .22)

# ------------------------------------------------------------------ MUSIQUE (originale, ré mineur, 100 BPM)
music = np.zeros((N, 2)); t = np.arange(N) / SR
def pad(freqs, detune=.004):
    out = np.zeros((N, 2))
    for f in freqs:
        for h, a in ((1, 1), (2, .35), (3, .18), (4, .08)):
            for ch, dt in ((0, -detune), (1, detune)):
                out[:, ch] += a * np.sin(2 * np.pi * f * h * (1 + dt) * t + rs.rand() * 6)
    return out / len(freqs)
drone = pad([73.42, 110.0, 146.83]) * (.55 + .2 * np.sin(2 * np.pi * .11 * t))[:, None]
high = pad([293.66, 349.23, 440.0], .006) * (.5 + .5 * np.sin(2 * np.pi * .07 * t + 1))[:, None]
# courbe d'intensité : monte dans les chutes, se retire avant les révélations
lvl = np.interp(t, [0, .5, 1.3, 3.3, 5.0, 6.8, 7.7, 9.9, 10.0, 10.4, 10.5, 11.5, 12.5, 15.0, 15.7, 17.5, 17.6, 18.0, 18.14, 19.2, 20.2, 22.5, 26.2, 26.8, 28.6, 29.5],
                   [0, .5, .7, .6, .75, .9, .6, 1.0, 0, 0, .0, .0, .55, .7, .8, 1.05, 0, 0, .0, .0, .6, .7, .65, .9, .6, 0])
music += drone * .5 * lvl[:, None] + high * .16 * (lvl ** 2)[:, None]
# pulsation (doubles croches « horloge ») — la seconde qui passe
beat = 60 / 100
notes = [146.83, 220.0, 293.66, 220.0, 174.61, 261.63, 220.0, 196.0]
k = 0; tt = 1.3
while tt < END - .1:
    f = notes[k % 8] * (2 if (k // 16) % 2 else 1)
    n = int(.22 * SR); x = np.arange(n) / SR
    pl = (np.sin(2 * np.pi * f * x) + .4 * np.sin(4 * np.pi * f * x)) * np.exp(-x * 22) * np.minimum(1, x / .003)
    g = np.interp(tt, t[::480], lvl[::480])
    place(music, pl, tt, .22 * g * (1.3 if k % 4 == 0 else .8), pan=.5 * np.sin(k * 1.3))
    tt += beat / 2; k += 1
# « tic » d'horloge régulier, une fois par temps
tt = 0.0
while tt < END - .1:
    g = np.interp(tt, t[::480], lvl[::480]); place(music, tick(900, .03), tt, .10 * g, pan=-.3); tt += beat
music = reverb(music, 2.4, .35)
music *= np.interp(t, [0, DUR - .8, DUR], [1, 1, 0])[:, None]

def norm(x, peak):
    return x / (np.abs(x).max() + 1e-9) * peak
def save(path, x):
    x = np.tanh(x * 1.1) / np.tanh(1.1)
    x = np.clip(x, -1, 1); fade = np.interp(np.arange(len(x)) / SR, [0, .01, DUR - .15, DUR], [0, 1, 1, 0])[:, None]
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * fade * 32767).astype('<i2').tobytes())

out = sys.argv[1] if len(sys.argv) > 1 else '.'
sfx = norm(sfx, .85); music = norm(music, .5)
save(f'{out}/sfx.wav', sfx); save(f'{out}/music.wav', music); save(f'{out}/mix.wav', norm(sfx + music * .8, .92))
print('audio ok')
