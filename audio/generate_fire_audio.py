#!/usr/bin/env python3
"""
Fireplace sound generator (numpy only).

Builds a stereo wood-fire soundscape that loops seamlessly:
  * roar      - low, breathing rumble of the burning bed
  * flutter   - mid-band "whoosh" of flames licking upward
  * sizzle    - faint high hiss, with occasional sap-sizzle episodes
  * crackles  - clusters of tiny wood ticks (the classic fireplace crackle)
  * pops      - sharp sap snaps with a short resonant ring
  * settles   - every couple of minutes a log shifts: soft thud + burst of crackle
  * room      - short warm room reverb

Every component is generated circularly (spectral shaping over the whole
buffer, events wrapped modulo the length, circular reverb), so the end of
the file flows straight into the start with no seam.

Usage:
  python3 audio/generate_fire_audio.py --minutes 10 --out build/fire_audio.wav
"""
import argparse
import os
import wave

import numpy as np

SR = 48000


def shaped_noise(rng, n, shape_fn):
    """Circular noise with magnitude spectrum given by shape_fn(freqs_hz)."""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    spec *= shape_fn(f)
    x = np.fft.irfft(spec, n)
    return x / (np.std(x) + 1e-12)


def lfo(rng, n, lo_hz, hi_hz):
    """Smooth circular random modulation, zero-mean, unit std, band-limited to [lo, hi] Hz."""
    def band(f):
        return ((f >= lo_hz) & (f <= hi_hz)).astype(float) / np.sqrt(np.maximum(f, lo_hz))
    return shaped_noise(rng, n, band)


def bandpass_shape(lo, hi, slope_lo=2.0, slope_hi=2.0):
    def s(f):
        f = np.maximum(f, 1.0)
        return 1.0 / (1 + (lo / f) ** slope_lo) / (1 + (f / hi) ** slope_hi)
    return s


def add_wrapped(buf, start, sig, gain_l, gain_r, delay_r=0):
    """Add mono sig into stereo buf at start (wrapping around the end)."""
    n = buf.shape[1]
    for ch, g, d in ((0, gain_l, 0), (1, gain_r, delay_r)):
        idx = (start + d + np.arange(len(sig))) % n
        np.add.at(buf[ch], idx, sig * g)


def pan_gains(rng, width=0.8):
    p = rng.uniform(-width, width)
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a), int(max(0, p) * rng.uniform(0, 18))


def lowpass_kernel(tau_samples, length=None):
    length = length or int(tau_samples * 6) + 1
    k = np.exp(-np.arange(length) / max(tau_samples, 0.3))
    return k / k.sum()


def tick(rng, brightness):
    """One tiny wood tick: a few ms of filtered, decaying noise."""
    n = int(SR * rng.uniform(0.0006, 0.004))
    x = rng.standard_normal(n)
    # brightness: 1 = very bright (raw/differentiated), 0 = duller
    if brightness > 0.6:
        x = np.diff(x, prepend=0.0)
    else:
        x = np.convolve(x, lowpass_kernel(1.0 + (0.6 - brightness) * 6), mode="same")
    env = np.exp(-np.arange(n) / (SR * rng.uniform(0.0002, 0.0012)))
    return x * env / (np.max(np.abs(x * env)) + 1e-9)


def crackle_cluster(rng):
    """Several ticks within ~20-200 ms: the signature crackle of burning wood."""
    count = int(rng.integers(2, 14))
    span = rng.uniform(0.02, 0.22)
    length = int(SR * (span + 0.01))
    out = np.zeros(length)
    bright = rng.uniform(0.3, 1.0)
    times = np.sort(rng.uniform(0, span, count))
    for t in times:
        tk = tick(rng, np.clip(bright + rng.normal(0, 0.15), 0, 1))
        s = int(t * SR)
        e = min(length, s + len(tk))
        out[s:e] += tk[: e - s] * rng.lognormal(-0.3, 0.6)
    return out / (np.max(np.abs(out)) + 1e-9)


def pop(rng):
    """A sharp sap snap: transient + short resonant ring + noise tail."""
    n = int(SR * rng.uniform(0.03, 0.09))
    t = np.arange(n) / SR
    f0 = rng.uniform(1100, 4200)
    ring = np.sin(2 * np.pi * f0 * t + rng.uniform(0, 6.28)) * np.exp(-t / rng.uniform(0.002, 0.009))
    noise = np.diff(rng.standard_normal(n), prepend=0.0) * np.exp(-t / rng.uniform(0.003, 0.02))
    x = 0.55 * ring + 0.8 * noise
    x[: int(SR * 0.0004)] += rng.choice([-1, 1]) * 1.5  # click
    # little after-crackle
    tail = crackle_cluster(rng) * 0.35
    x = np.concatenate([x, np.zeros(len(tail))])
    x[int(n * 0.4): int(n * 0.4) + len(tail)] += tail
    return x / (np.max(np.abs(x)) + 1e-9)


def thud(rng):
    """Log settling: soft low thump with a bit of woody scrape."""
    n = int(SR * 0.6)
    t = np.arange(n) / SR
    f = rng.uniform(55, 95) * (1 - 0.25 * t / t[-1])
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
    scrape = np.convolve(rng.standard_normal(n), lowpass_kernel(6), mode="same") * np.exp(-t / 0.18) * 0.35
    x = body + scrape
    return x / (np.max(np.abs(x)) + 1e-9)


def room_ir(rng, seconds=0.35):
    n = int(SR * seconds)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / 0.07)
    ir = np.convolve(ir, lowpass_kernel(3), mode="same")  # warm, not glassy
    ir[:int(SR * 0.008)] = 0  # pre-delay
    return ir / np.sqrt(np.sum(ir ** 2))


def circular_convolve(x, ir):
    n = len(x)
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, n), n)


def generate(minutes, seed, target_rms_db=-22.0):
    rng = np.random.default_rng(seed)
    n = int(SR * 60 * minutes)
    out = np.zeros((2, n))

    # slow "fire activity" envelope (0.3..1.6) drives how busy the fire is
    activity = np.exp(0.35 * lfo(rng, n, 1 / 90, 1 / 15))

    # --- roar: low rumble, two decorrelated channels
    for ch in range(2):
        roar = shaped_noise(rng, n, bandpass_shape(35, 260, 3, 2.5))
        mod = np.exp(0.25 * lfo(rng, n, 0.08, 0.9))
        out[ch] += 0.022 * roar * mod * np.sqrt(activity)

    # --- flame flutter: mid "whoosh" with fast irregular modulation
    for ch in range(2):
        fl = shaped_noise(rng, n, bandpass_shape(250, 1400, 2, 2))
        mod = np.clip(1 + 0.6 * lfo(rng, n, 1.0, 9.0), 0, None)
        out[ch] += 0.006 * fl * mod * activity

    # --- sizzle: faint hiss + occasional sap episodes
    sizzle_env = np.zeros(n)
    for _ in range(int(minutes * 3)):
        c = rng.integers(0, n)
        L = int(SR * rng.uniform(2, 9))
        win = np.hanning(L) ** 2
        idx = (c + np.arange(L)) % n
        sizzle_env[idx] += win * rng.uniform(0.4, 1.0)
    for ch in range(2):
        hs = shaped_noise(rng, n, bandpass_shape(3500, 11000, 2, 3))
        flick = np.clip(1 + 0.8 * lfo(rng, n, 3, 25), 0, None)
        out[ch] += hs * (0.0012 + 0.006 * sizzle_env * flick)

    # --- crackle events: Poisson process modulated by activity
    def place(rate_per_s, maker, gain_mu, gain_sigma, width=0.8):
        expected = rate_per_s * n / SR
        cands = rng.uniform(0, n, int(expected * 1.8)).astype(int)
        keep = rng.uniform(0, 1.8, len(cands)) < activity[cands]
        for s in cands[keep]:
            sig = maker(rng)
            g = rng.lognormal(gain_mu, gain_sigma)
            gl, gr, d = pan_gains(rng, width)
            if rng.uniform() < 0.5:
                gl, gr = gr, gl
            add_wrapped(out, int(s), sig * g, gl, gr, d)

    place(12.0, lambda r: tick(r, r.uniform(0.2, 1.0)), np.log(0.11), 0.8)   # constant fine ticking
    place(2.4, crackle_cluster, np.log(0.30), 0.6)                           # crackle clusters
    place(0.12, pop, np.log(0.75), 0.45, width=0.6)                          # sap pops

    # --- log settles every ~1.5-3.5 min, followed by a flurry of crackles
    t = rng.uniform(20, 60)
    while t < 60 * minutes:
        s = int(t * SR)
        gl, gr, d = pan_gains(rng, 0.4)
        add_wrapped(out, s, thud(rng) * 0.45, gl, gr, d)
        for _ in range(int(rng.integers(6, 16))):
            off = int(SR * rng.uniform(0.05, 2.5))
            g2 = pan_gains(rng, 0.8)
            add_wrapped(out, s + off, crackle_cluster(rng) * rng.lognormal(np.log(0.25), 0.4), *g2)
        t += rng.uniform(90, 210)

    # --- room reverb (circular so the loop stays seamless)
    ir_l, ir_r = room_ir(rng), room_ir(rng)
    wet = np.stack([circular_convolve(out[0], ir_l), circular_convolve(out[1], ir_r)])
    out = out + 0.22 * wet

    # gentle high-cut to take digital edge off (circular, linear phase)
    for ch in range(2):
        spec = np.fft.rfft(out[ch])
        f = np.fft.rfftfreq(n, 1 / SR)
        spec /= np.sqrt(1 + (f / 14000) ** 6)
        out[ch] = np.fft.irfft(spec, n)

    # bring to target loudness, then soft-knee limit the big pops so the
    # peak stays under -1 dBFS (fire audio is very peaky; this keeps it
    # comfortably loud without flattening the crackle)
    out *= 10 ** (target_rms_db / 20) / np.sqrt(np.mean(out ** 2))
    knee, ceil = 0.5, 10 ** (-1 / 20)
    a = np.abs(out)
    over = a > knee
    out[over] = np.sign(out[over]) * (knee + (ceil - knee) * np.tanh((a[over] - knee) / (ceil - knee)))
    return out


def write_wav(path, x):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutes", type=float, default=10.0, help="loop length in minutes (default 10)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="build/fire_audio.wav")
    a = ap.parse_args()
    x = generate(a.minutes, a.seed)
    write_wav(a.out, x)
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)))
    print(f"wrote {a.out}: {a.minutes} min, stereo {SR} Hz, RMS {rms:.1f} dBFS")


if __name__ == "__main__":
    main()
