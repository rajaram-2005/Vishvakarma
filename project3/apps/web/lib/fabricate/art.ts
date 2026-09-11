// Aetherion Fabricate — local generative art.
// Deterministic, offline image synthesis from a prompt: layered nebula
// gradients, orbits, glyph scatter and grain. Runs entirely on-device (no
// model needed). Puter's txt2img covers photorealistic generation when the
// user is signed in; this is the always-available fallback.

import { hashSeed, rngFrom } from './geometry';

export interface ArtSpec {
  prompt: string;
  width: number;
  height: number;
  palette: string[];
  hue: number;
  seed: number;
}

export function artSpecFor(prompt: string, width = 1024, height = 1024): ArtSpec {
  const seed = hashSeed(prompt.toLowerCase());
  const rnd = rngFrom(seed);
  const hue = Math.floor(rnd() * 360);
  const hues = [hue, (hue + 40 + Math.floor(rnd() * 60)) % 360, (hue + 200 + Math.floor(rnd() * 80)) % 360];
  return {
    prompt,
    width,
    height,
    palette: hues.map((h) => `hsl(${h} 82% ${58 + Math.floor(rnd() * 16)}%)`),
    hue,
    seed,
  };
}

/** Paints the art onto a canvas 2D context. */
export function paintArt(ctx: CanvasRenderingContext2D, spec: ArtSpec): void {
  const { width: W, height: H, palette } = spec;
  const rnd = rngFrom(spec.seed);
  const [c0, c1, c2] = palette;
  // 'hsl(H S% L%)' → 'hsl(H S% L% / a)' — appending hex alpha would be invalid CSS
  const alphaColor = (c: string, a: number) => c.replace(')', ` / ${a})`);

  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, W, H);

  // nebula blobs
  const blobs = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < blobs; i++) {
    const gx = W * (0.1 + rnd() * 0.8);
    const gy = H * (0.1 + rnd() * 0.8);
    const gr = Math.min(W, H) * (0.25 + rnd() * 0.5);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, palette[i % palette.length].replace(')', ' / 0.5)').replace('hsl', 'hsla'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // orbital rings
  const rings = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < rings; i++) {
    const cx = W * (0.3 + rnd() * 0.4);
    const cy = H * (0.3 + rnd() * 0.4);
    const r = Math.min(W, H) * (0.12 + rnd() * 0.3);
    ctx.strokeStyle = alphaColor(palette[(i + 1) % palette.length], 0.33);
    ctx.lineWidth = 1 + rnd() * 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * (0.35 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
    // companion arc
    ctx.strokeStyle = alphaColor(palette[(i + 2) % palette.length], 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.15, r * (0.3 + rnd() * 0.5), rnd() * Math.PI, rnd() * 2, rnd() * 2 + Math.PI * 0.9);
    ctx.stroke();
  }

  // glyph scatter — deterministic "stars" spelling the prompt's entropy
  const glyphs = ['◈', '✦', '·', '◉', '✧', '▲', '◭'];
  const count = 60 + Math.floor(rnd() * 90);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < count; i++) {
    const gx = rnd() * W;
    const gy = rnd() * H;
    const size = 6 + rnd() * 22;
    ctx.font = `${size}px ui-sans-serif, system-ui`;
    ctx.fillStyle = alphaColor(palette[i % palette.length], 0.07 + rnd() * 0.2);
    ctx.fillText(glyphs[Math.floor(rnd() * glyphs.length)], gx, gy);
  }

  // grain
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // vignette + hue sweep
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,3,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // caption band
  ctx.fillStyle = alphaColor(c0, 0.2);
  ctx.fillRect(0, H - 46, W, 46);
  ctx.fillStyle = '#dfe6ff';
  ctx.font = '15px ui-monospace, monospace';
  ctx.textAlign = 'left';
  const label = `aetherion.art · "${spec.prompt.slice(0, 48)}${spec.prompt.length > 48 ? '…' : ''}" · seed ${spec.seed.toString(16)}`;
  ctx.fillText(label, 20, H - 20);

  void c1;
  void c2;
}
