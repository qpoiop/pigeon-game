/** Minimal WebAudio synth — every sound is a single ramped oscillator. */
type OscType = OscillatorType;

interface Ambient {
  g: GainNode;
  o1: OscillatorNode;
  o2: OscillatorNode;
  lfo: OscillatorNode;
}

export class Sfx {
  ctx: AudioContext | null = null;
  muted = false;
  private amb: Ambient | null = null;

  ensure(): void {
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      } catch {
        /* audio unavailable — game stays silent */
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  tone(f0: number, f1: number, dur: number, type: OscType = 'sine', gain = 0.08, when = 0): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pickup(): void {
    this.tone(660, 990, 0.12, 'sine', 0.09);
    this.tone(990, 1480, 0.14, 'sine', 0.07, 0.09);
  }
  item(): void {
    this.tone(440, 660, 0.1, 'triangle', 0.08);
  }
  use(): void {
    this.tone(300, 520, 0.14, 'triangle', 0.07);
  }
  alert(): void {
    this.tone(340, 210, 0.16, 'square', 0.05);
  }
  spotted(): void {
    this.tone(520, 520, 0.09, 'square', 0.06);
    this.tone(520, 520, 0.09, 'square', 0.06, 0.12);
  }
  fail(): void {
    this.tone(330, 110, 0.5, 'sawtooth', 0.06);
  }
  clear(): void {
    const f = [523, 659, 784, 1046];
    for (let i = 0; i < 4; i++) this.tone(f[i], f[i], 0.16, 'sine', 0.08, i * 0.11);
  }
  dash(): void {
    this.tone(180, 420, 0.1, 'triangle', 0.05);
  }
  ui(): void {
    this.tone(880, 880, 0.05, 'sine', 0.05);
  }

  /** Low sustained drone (two detuned sines + slow LFO tremolo) during play. */
  startAmb(): void {
    if (!this.ctx || this.amb) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(c.destination);
    const o1 = c.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 110;
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 164.8;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.005;
    lfo.connect(lg);
    lg.connect(g.gain);
    o1.connect(g);
    o2.connect(g);
    g.gain.setTargetAtTime(0.011, c.currentTime, 2);
    o1.start();
    o2.start();
    lfo.start();
    this.amb = { g, o1, o2, lfo };
  }

  stopAmb(): void {
    const a = this.amb;
    if (!a || !this.ctx) {
      this.amb = null;
      return;
    }
    this.amb = null;
    try {
      a.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      setTimeout(() => {
        try {
          a.o1.stop();
          a.o2.stop();
          a.lfo.stop();
        } catch {
          /* already stopped */
        }
      }, 1200);
    } catch {
      /* noop */
    }
  }

  /** Stop the drone and release the AudioContext (called on teardown). */
  dispose(): void {
    this.stopAmb();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') {
      try {
        void ctx.close();
      } catch {
        /* already closing */
      }
    }
  }
}
