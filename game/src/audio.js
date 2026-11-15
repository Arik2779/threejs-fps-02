// Synthesised sound only: no audio files, no network. Every effect is a short WebAudio
// graph built from a shared noise buffer and oscillators, so the game ships silent files.
export function createAudio() {
  let ctx = null;
  let noise = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function burst(seconds, filterFreq, gainValue, when = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gainValue, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  function tone(freq, seconds, gainValue, type = 'sine', when = 0, slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(gainValue, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'longbow') {
        burst(0.28, 900, 0.9);
        tone(140, 0.18, 0.5, 'square', 0, 60);
      } else if (kind === 'hornet') {
        burst(0.09, 2400, 0.45);
        tone(220, 0.06, 0.25, 'square', 0, 110);
      } else if (kind === 'p10') {
        burst(0.12, 1800, 0.55);
        tone(180, 0.08, 0.3, 'square', 0, 90);
      } else {
        burst(0.14, 1600, 0.7);
        tone(160, 0.1, 0.35, 'square', 0, 70);
      }
    },
    enemyShot(distance) {
      const v = Math.max(0.08, 0.5 - distance * 0.012);
      burst(0.12, 1100, v);
    },
    dry() {
      tone(1400, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.04, 0.2, 'square');
      tone(620, 0.05, 0.2, 'square', 0.16);
    },
    hit(killed) {
      tone(1250, 0.05, 0.3, 'sine');
      if (killed) tone(1650, 0.09, 0.3, 'sine', 0.06);
    },
    hurt() {
      tone(110, 0.16, 0.4, 'sawtooth', 0, 70);
    },
    beep(final) {
      tone(final ? 1320 : 880, 0.08, 0.3, 'sine');
    },
    boom() {
      burst(0.9, 320, 1.0);
      tone(70, 0.7, 0.6, 'sine', 0, 32);
    },
    buy() {
      tone(990, 0.07, 0.25, 'sine');
      tone(1320, 0.1, 0.25, 'sine', 0.07);
    },
    sting(win) {
      if (win) {
        tone(523, 0.16, 0.3, 'triangle');
        tone(659, 0.16, 0.3, 'triangle', 0.14);
        tone(784, 0.3, 0.3, 'triangle', 0.28);
      } else {
        tone(392, 0.2, 0.3, 'triangle');
        tone(311, 0.2, 0.3, 'triangle', 0.16);
        tone(233, 0.36, 0.3, 'triangle', 0.32);
      }
    },
  };
}
