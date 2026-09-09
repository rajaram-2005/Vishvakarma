// SUTRA — optional ambient soundscape, synthesized live with WebAudio.
// A slow evolving pad: two detuned low voices, a shimmer layer, gentle noise
// air. OFF by default; no audio assets are shipped.

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];
  private volume = 0.5;
  private _running = false;

  get running() {
    return this._running;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.targetGain(), this.ctx.currentTime, 0.4);
    }
  }

  private targetGain() {
    return 0.045 * this.volume;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  start() {
    if (this._running) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      const mk = (type: OscillatorType, freq: number, gain: number, detune = 0) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g);
        g.connect(master);
        o.start();
        this.nodes.push(o);
        return o;
      };

      // low pad: A1 + slightly detuned partner
      mk('sawtooth', 55, 0.5);
      mk('sawtooth', 55.4, 0.42, 6);
      // sub
      mk('sine', 110.2, 0.3);
      // shimmer
      mk('sine', 440.5, 0.05);
      mk('sine', 659.3, 0.035);

      // lowpass on the pad via a shared filter (kept subtle)
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      filt.Q.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.055;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(filt.frequency);
      lfo.start();
      this.nodes.push(lfo);
      master.disconnect();
      master.connect(filt);
      filt.connect(ctx.destination);

      // noise air
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      src.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 900;
      nf.Q.value = 0.4;
      const ng = ctx.createGain();
      ng.gain.value = 0.012;
      src.connect(nf);
      nf.connect(ng);
      ng.connect(filt);
      src.start();
      this.nodes.push(src);

      // slow tremolo on master
      const trem = ctx.createOscillator();
      trem.frequency.value = 0.09;
      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.012;
      trem.connect(tremGain);
      tremGain.connect(master.gain);
      trem.start();
      this.nodes.push(trem);

      this._running = true;
      const target = this.targetGain();
      master.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* audio unavailable — stay silent */
    }
  }

  stop() {
    if (!this._running) return;
    const ctx = this.ctx;
    const master = this.master;
    if (ctx && master) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    }
    const nodes = this.nodes;
    this.nodes = [];
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      void ctx?.close();
    }, 900);
    this._running = false;
    this.ctx = null;
    this.master = null;
  }
}

export const ambient = new AmbientEngine();
