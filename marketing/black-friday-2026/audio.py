"""Original soundtrack for the Black Friday spot, synthesised from scratch and
locked to the same timing.json the picture uses. 120 BPM, A minor.

    python3 audio.py out/music.wav
"""
import json, sys, os
import numpy as np
from scipy.signal import butter, sosfilt, sosfilt_zi, fftconvolve
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, 'timing.json')))
SR = 48000
DUR = T['duration']
N = int(DUR * SR)
BEAT = 60 / T['bpm']
rng = np.random.default_rng(1127)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(n): return np.arange(n) / SR
def S(sec): return int(round(sec * SR))

class Bus:
    def __init__(self): self.x = np.zeros((2, N))
    def add(self, sig, t, gain=1.0, pan=0.0):
        sig = np.atleast_2d(sig)
        if sig.shape[0] == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.vstack([sig[0] * l * 1.414, sig[0] * r * 1.414])
        i = S(t)
        if i >= N: return
        j = min(N, i + sig.shape[1])
        if i < 0: sig, i = sig[:, -i:], 0
        self.x[:, i:j] += gain * sig[:, : j - i]

def filt(x, kind, f, order=2):
    f = np.clip(np.atleast_1d(f), 20, SR / 2 * 0.95)
    if kind == 'band': sos = butter(order, f, btype='band', fs=SR, output='sos')
    else: sos = butter(order, f[0], btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=-1)

def sweep_lp(x, f0, f1, block=256, kind='low', q_order=2):
    """Time-varying filter: cutoff moves exponentially from f0 to f1 across x."""
    x = np.atleast_2d(x); out = np.zeros_like(x); n = x.shape[1]
    zi = None
    for b in range(0, n, block):
        fr = b / max(1, n - 1)
        fc = f0 * (f1 / f0) ** fr
        sos = butter(q_order, min(fc, SR * 0.45), btype=kind, fs=SR, output='sos')
        if zi is None: zi = np.stack([sosfilt_zi(sos) * 0 for _ in range(x.shape[0])], axis=1)
        out[:, b:b + block], zi = sosfilt(sos, x[:, b:b + block], axis=-1, zi=zi)
    return out

def polyblep_saw(freq, n, phase0=0.0):
    dt = freq / SR
    ph = (phase0 + np.cumsum(np.full(n, dt) if np.isscalar(freq) else dt)) % 1.0
    y = 2 * ph - 1
    d = dt if not np.isscalar(dt) else np.full(n, dt)
    m = ph < d; tt_ = ph[m] / d[m]; y[m] -= tt_ + tt_ - tt_ * tt_ - 1
    m = ph > 1 - d; tt_ = (ph[m] - 1) / d[m]; y[m] -= tt_ * tt_ + tt_ + tt_ + 1
    return y

def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    t = tt(n); hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel) ** 2

def noise(n, ch=1): return rng.standard_normal((ch, n)) if ch > 1 else rng.standard_normal(n)

def reverb_ir(sec=1.8, decay=2.6, bright=6000, pre=0.018):
    n = S(sec); t = tt(n)
    ir = noise(n, 2) * np.exp(-t * decay)
    ir = filt(ir, 'low', bright)
    ir[:, :S(pre)] = 0
    return ir / np.sqrt((ir ** 2).sum() / 2)

# ── instruments ────────────────────────────────────────────────────────────
def kick(punch=1.0):
    n = S(0.55); t = tt(n)
    f = 46 + 120 * np.exp(-t * 30) + 40 * np.exp(-t * 200)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    knock = np.sin(2 * np.pi * np.cumsum(140 + 260 * np.exp(-t * 45)) / SR) * np.exp(-t * 32) * 0.55
    click = filt(noise(n), 'high', 2500) * np.exp(-t * 400) * 0.45
    return np.tanh((body + knock + click) * 1.8 * punch) * 0.9

def clap():
    n = S(0.45); t = tt(n); env = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022, 0.031]):
        tk = t - off; env += np.where(tk >= 0, np.exp(-np.clip(tk, 0, None) * (180 if k < 3 else 16)), 0)
    return filt(noise(n), 'band', [900, 4200]) * env * 0.7

def snare(pitch=1.0):
    n = S(0.22); t = tt(n)
    tone = np.sin(2 * np.pi * 190 * pitch * t + 2 * np.exp(-t * 40)) * np.exp(-t * 26)
    nz = filt(noise(n), 'band', [1500 * pitch, 8000]) * np.exp(-t * 22)
    return (tone * 0.5 + nz * 0.8) * 0.7

def hat(open_=False):
    n = S(0.3 if open_ else 0.07); t = tt(n)
    return filt(noise(n), 'high', 7500) * np.exp(-t * (14 if open_ else 70)) * 0.45

def boom(sec=2.2, f0=62, f1=30):
    n = S(sec); t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 3)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.9)
    thud = filt(noise(n), 'low', 180) * np.exp(-t * 9) * 1.2
    return np.tanh((sub + thud) * 1.6) * 0.95

def crash(sec=2.0):
    n = S(sec); t = tt(n)
    nz = filt(noise(n, 2), 'high', 3200) * np.exp(-t * 2.4)
    shimmer = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in [3170, 4411, 5233, 6740, 8150]) * np.exp(-t * 3.5) * 0.06
    return (nz * 0.5 + shimmer) * 0.6

def whoosh(sec, f0=300, f1=6000, peak=0.6):
    n = S(sec); t = tt(n); p = t / sec
    x = noise(n, 2)
    y = sweep_lp(x, f0, f1, kind='low')
    y = sweep_lp(y, f0 * 0.3, f1 * 0.4, kind='high')
    env = np.sin(np.pi * np.clip(p / peak, 0, 1) / 2) ** 2 * np.where(p < peak, 1, np.exp(-(p - peak) / (1 - peak) * 4))
    pan = np.vstack([1 - 0.5 * p, 0.5 + 0.5 * p])
    return y * env * pan * 1.4

def riser(sec, f0=180, f1=1400):
    n = S(sec); t = tt(n); p = t / sec
    f = f0 * (f1 / f0) ** (p ** 1.5)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 + polyblep_saw(f * 1.005, n) * 0.08
    nz = sweep_lp(noise(n, 2), 500, 12000, kind='low')[0] * 0.5
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(4 + 20 * p ** 2) / SR)
    return (tone + nz) * (p ** 2.2) * trem

def bell(m, sec=1.6, idx=3.0):
    n = S(sec); t = tt(n); f = mtof(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * idx * np.exp(-t * 6)
    c = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 3.2)
    c += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 5)
    return c * np.minimum(1, t / 0.002) * 0.5

def pluck(m, sec=0.5, bright=1.0):
    n = S(sec); t = tt(n); f = mtof(m); y = np.zeros(n)
    for k in range(1, 22):
        if f * k > SR * 0.45: break
        y += np.sin(2 * np.pi * f * k * t + k) / k * np.exp(-t * (4 + k * 2.2 / bright))
    return y * np.minimum(1, t / 0.002) * 0.5

def supersaw(notes, sec, cutoff0, cutoff1, det=0.18, voices=7):
    n = S(sec); out = np.zeros((2, n))
    for m in notes:
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * det
            y = polyblep_saw(mtof(m + d), n, rng.uniform())
            pan = (v / (voices - 1)) * 2 - 1
            out[0] += y * np.cos((pan + 1) * np.pi / 4); out[1] += y * np.sin((pan + 1) * np.pi / 4)
    out = sweep_lp(out, cutoff0, cutoff1)
    return out / (len(notes) * voices) * 2.2

def bass(m, sec):
    n = S(sec); t = tt(n); f = mtof(m)
    y = polyblep_saw(f, n) * 0.9 + np.sin(2 * np.pi * f * t) * 0.45
    y = sweep_lp(y, 2200, 380)[0]
    return np.tanh(y * 1.4) * adsr(n, 0.003, 0.08, 0.6, 0.04)

def key_click(strength=1.0):
    n = S(0.04); t = tt(n)
    return (filt(noise(n), 'band', [1800, 7000]) * np.exp(-t * 260) * 0.5 + np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 500) * 0.15) * strength

def pop(f0=900, f1=300):
    n = S(0.09); t = tt(n); f = f1 + (f0 - f1) * np.exp(-t * 60)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * 0.5

def buzz(sec):
    n = S(sec); t = tt(n)
    y = sum(np.sin(2 * np.pi * 50 * k * t) / k for k in [1, 2, 3, 5, 7, 9]) + filt(noise(n), 'band', [2000, 6000]) * 0.3
    return np.tanh(y * 2) * 0.35

# ── arrangement ────────────────────────────────────────────────────────────
drums, bassb, music, fx, verb_send = Bus(), Bus(), Bus(), Bus(), Bus()
t_black, t_fri, t_end = T['slamBlack'], T['slamFriday'], T['end']
groove_end = T['dive'][0] - 0.15            # ~13.0: drums drop for the build
CH = {'Am': [57, 60, 64, 69], 'F': [53, 57, 60, 65], 'C': [55, 60, 64, 67], 'G': [55, 59, 62, 67]}
ROOT = {'Am': 33, 'F': 29, 'C': 36, 'G': 31}
def chord_at(t):
    if t >= 14: return 'Am'
    if t >= 13: return 'G'
    return ['Am', 'Am', 'F', 'C', 'G', 'Am', 'F'][int(t // 2)]

# Intro: daylight. A soft muffled pad, an ocean wash and a quiet arpeggio.
intro_len = T['blackout']
pad = supersaw([57, 60, 64, 71], intro_len + 0.05, 500, 1400, det=0.12) * 0.55
pad *= np.minimum(1, tt(pad.shape[1]) / 0.6)
music.add(pad, 0)
n = S(intro_len); tw = tt(n)
ocean = filt(noise(n, 2), 'low', 900) * (0.35 + 0.25 * np.sin(2 * np.pi * tw / 2.2 - 1.2)) * np.minimum(1, tw / 0.4)
fx.add(ocean * 0.35, 0)
arp = [69, 76, 72, 76, 81, 76, 72, 76]
for i, m in enumerate(arp):
    tn = i * 0.25
    if tn >= intro_len - 0.05: break
    p = pluck(m, 0.6, 0.7) * 0.32
    music.add(p, tn, pan=0.3 if i % 2 else -0.3)
    music.add(p * 0.35, tn + 0.375, pan=-0.5 if i % 2 else 0.5)
fx.add(riser(intro_len - 0.85), 0.85, 0.5)

# Power failure: gate the intro with the same flicker the picture uses, plus buzz and relay clicks.
flick = T['flicker']
gate = np.ones(N)
for k, (ft, lv) in enumerate(flick):
    gate[S(ft):] = lv
gate[S(T['blackout']):S(t_black)] = 0
sm = np.ones(S(0.004)) / S(0.004)
gate = np.convolve(gate, sm, mode='same')
fx.add(buzz(T['blackout'] - flick[0][0]) * 0.45, flick[0][0])
for b in (music, fx):
    b.x[:, :S(t_black)] *= gate[:S(t_black)]
for ft, lv in flick[1:]:
    fx.add(key_click(1.6) * 1.2, ft, pan=rng.uniform(-.4, .4))

# BLACK — FRIDAY: two hits.
drums.add(kick(1.3), t_black, 1.0); fx.add(boom(), t_black, 0.9); fx.add(crash(2.2), t_black, 0.55)
verb_send.add(crash(1.0) * 0.5, t_black)
drums.add(kick(1.2), t_fri, 0.9); fx.add(boom(1.4, 70, 34), t_fri, 0.6)
drums.add(clap(), t_fri, 1.0); verb_send.add(clap() * 1.1, t_fri)

# Groove from 3.0.
kicks = [t_black, t_fri]
t = 3.0
while t < groove_end - 1e-6:
    drums.add(kick(), t, 0.95); kicks.append(t)
    if abs((t / BEAT) % 2 - 1) < 1e-6:   # beats 2 & 4
        drums.add(clap(), t, 0.75); verb_send.add(clap() * 0.5, t)
    drums.add(hat(True), t + BEAT / 2, 0.42, pan=0.15)
    if t >= T['titleC']:
        for s16 in (0.25, 0.75):
            drums.add(hat(False), t + BEAT * s16, 0.32 + 0.1 * (s16 == 0.75), pan=-0.25)
    t += BEAT
# End-card groove 14 → 16, and the final hit at 16.
t = t_end
while t < T['endPulse'] - 1e-6:
    drums.add(kick(), t, 0.95); kicks.append(t)
    if abs((t / BEAT) % 2 - 1) < 1e-6: drums.add(clap(), t, 0.75); verb_send.add(clap() * 0.5, t)
    drums.add(hat(True), t + BEAT / 2, 0.4, pan=0.15)
    for s16 in (0.25, 0.75): drums.add(hat(False), t + BEAT * s16, 0.3, pan=-0.25)
    t += BEAT
drums.add(kick(1.3), T['endPulse'], 1.0); kicks.append(T['endPulse'])
fx.add(boom(1.2, 66, 32), t_end, 0.95); fx.add(crash(2.4), t_end, 0.6); verb_send.add(crash(1.2) * 0.5, t_end)
fx.add(crash(1.4), T['endPulse'], 0.35); verb_send.add(clap() * 0.8, T['endPulse'])

# Bass: off-beat eighths on the chord root.
def bass_run(t0, t1):
    t = t0
    while t < t1 - 1e-6:
        ch = chord_at(t + 0.01)
        bassb.add(bass(ROOT[ch], 0.22), t + BEAT / 2, 0.55)
        if int(t / BEAT) % 4 == 3: bassb.add(bass(ROOT[ch] + 12, 0.12), t + BEAT * 0.75, 0.35)
        t += BEAT
bass_run(t_black, groove_end); bass_run(t_end, T['endPulse'])
bassb.add(bass(33, 0.9), T['endPulse'], 0.6)

# Chords: wide supersaws, filter opening through the spot, pumped by the kick.
segments = [(2.0, 4.0, 'Am', 900, 2500), (4.0, 6.0, 'F', 2500, 3800), (6.0, 8.0, 'C', 3800, 5000), (8.0, 10.0, 'G', 3500, 5200),
            (10.0, 12.0, 'Am', 4000, 5500), (12.0, 13.0, 'F', 5000, 6000), (13.0, 13.92, 'G', 2500, 9000),
            (14.0, 16.0, 'Am', 6000, 6000), (16.0, 17.0, 'Am', 6000, 1200)]
for a, b, ch, c0, c1 in segments:
    seg = supersaw(CH[ch] + [CH[ch][0] - 12], b - a + 0.08, c0, c1) * 0.5
    n = seg.shape[1]; e = np.minimum(1, tt(n) / 0.01) * np.minimum(1, (n / SR - tt(n)) / 0.06)
    music.add(seg * e, a)

# Stabs: a syncopated pluck figure on top from the dates onward.
fig = [0, 3, 6, 10, 12]
for bar in range(2, 7):
    for s16 in fig:
        t = bar * 2 + s16 * BEAT / 4
        if t < T['titleC'] or t >= groove_end: continue
        ch = chord_at(t + 0.01)
        for m in CH[ch][1:]:
            music.add(pluck(m + 12, 0.3, 1.4) * 0.2, t, pan=0.2)
for bar in (7,):
    for s16 in fig:
        t = bar * 2 + s16 * BEAT / 4
        for m in CH['Am'][1:]: music.add(pluck(m + 12, 0.3, 1.4) * 0.2, t, pan=0.2)

# Scene accents.
for t, m in zip(T['tiles'], [76, 79, 81, 84]):
    b = bell(m, 1.4, 2.5) * (0.5 if m != 84 else 0.7)
    music.add(b, t, pan=-0.2 + 0.13 * (m - 76) / 2); verb_send.add(b * 0.6, t)
music.add(bell(88, 1.6, 3.0) * 0.35, T['tiles'][3], pan=0.3); verb_send.add(bell(88) * 0.4, T['tiles'][3])
fx.add(whoosh(0.5, 200, 7000, 0.85), T['zoomOut'][0] - 0.2, 0.5)
fx.add(whoosh(0.55, 400, 9000, 0.4), T['wipe'][0], 0.55)
fx.add(whoosh(0.45, 300, 6000, 0.7), T['dateLine'] - 0.1, 0.22)
fx.add(whoosh(0.5, 3000, 300, 0.3), T['tagDrop'] - 0.05, 0.4)
for k, dt_ in enumerate((0.0, 0.085)):
    b = bell(96 + k * 3, 1.2, 4.0) * 0.32
    music.add(b, T['tagDrop'] + 0.2 + dt_, pan=0.4); verb_send.add(b * 0.5, T['tagDrop'] + 0.2 + dt_)
fx.add(whoosh(0.45, 300, 8000, 0.6), T['push'][0] - 0.05, 0.5)
fx.add(whoosh(0.6, 150, 2500, 0.5), T['phoneIn'], 0.3)
fx.add(pop(1100, 500), T['urlTap'], 0.7, pan=0.1)
for i in range(len(T['url'])):
    fx.add(key_click(0.9 + 0.25 * rng.uniform()), T['typeStart'] + i * T['typeInterval'] + rng.uniform(-0.004, 0.004), 0.85, pan=rng.uniform(-0.25, 0.25))
fx.add(key_click(1.6), T['enter'], 1.0); fx.add(pop(500, 200), T['enter'], 0.5)
music.add(pluck(81, 0.4) * 0.2, T['load'][1] - 0.05); music.add(pluck(88, 0.4) * 0.2, T['load'][1] + 0.05)
fx.add(pop(1200, 400), T['buttonTap'], 0.8)

# The build: snare roll, riser, then a breath before the drop.
roll_start, roll_end = groove_end, T['dive'][1] - 0.08
t, k = roll_start, 0
while t < roll_end - 1e-6:
    p = (t - roll_start) / (roll_end - roll_start)
    drums.add(snare(1 + 0.5 * p), t, 0.25 + 0.55 * p ** 1.5, pan=0.1 * np.sin(k)); verb_send.add(snare() * 0.25 * p, t)
    t += BEAT / 4 if p < 0.5 else BEAT / 8; k += 1
fx.add(riser(roll_end - roll_start + 0.03, 220, 2200), roll_start, 0.8)
fx.add(whoosh(roll_end - roll_start, 200, 11000, 0.95), roll_start, 0.5)

# ── mix ────────────────────────────────────────────────────────────────────
# Sidechain: music and bass duck under every kick.
duck = np.ones(N)
for kt in kicks:
    i = S(kt); n = S(0.32); seg = 1 - 0.6 * (1 - np.linspace(0, 1, n)) ** 2
    j = min(N, i + n); duck[i:j] = np.minimum(duck[i:j], seg[: j - i])
music.x *= duck; bassb.x *= np.minimum(1, duck + 0.25)

ir = reverb_ir()
wet = np.vstack([fftconvolve(verb_send.x[0] + music.x[0] * 0.25 + fx.x[0] * 0.15, ir[0])[:N],
                 fftconvolve(verb_send.x[1] + music.x[1] * 0.25 + fx.x[1] * 0.15, ir[1])[:N]])
mix = drums.x * 0.62 + bassb.x * 0.5 + music.x * 1.9 + fx.x * 0.8 + wet * 0.3
mix = filt(mix, 'high', 28)

# Silence the gap between the build and the drop, and the blackout gap.
for a, b in ((T['blackout'] + 0.005, t_black - 0.004), (roll_end + 0.01, t_end - 0.004)):
    i, j = S(a), S(b); fade = np.linspace(1, 0, S(0.012))
    mix[:, i - len(fade):i] *= fade; mix[:, i:j] *= 0.0
    # keep reverb tails of the hits that follow
# Gentle bus glue and fade-out.
mix = np.tanh(mix * 0.9) / np.tanh(0.9)
tail = S(0.6); mix[:, -tail:] *= np.linspace(1, 0, tail) ** 1.5
mix /= np.max(np.abs(mix)) / 0.89

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'music.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out, f'{DUR}s')
