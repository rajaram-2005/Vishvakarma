'use client';
// Aetherion — the living particle universe.
// 3D-projected particle clouds, nebula fog, the central AI energy core,
// light trails and a perspective grid floor. Pure Canvas 2D, no deps.
// Honors reduced motion (renders one cinematic still) and visibility.

import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

export type UniverseMode = 'hero' | 'core' | 'mini';

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  hue: number; // 0 purple .. 1 cyan .. 2 magenta .. 3 blue
}

interface Spark {
  a: number;
  ring: number;
  speed: number;
  size: number;
}

const HUES = [262, 190, 300, 222];
const HUE_ALPHAS = [0.75, 0.8, 0.6, 0.7];

export function UniverseCanvas({
  mode = 'hero',
  className = '',
  intensity = 1,
  parallax = true,
}: {
  mode?: UniverseMode;
  className?: string;
  intensity?: number;
  parallax?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rm = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let t = 0;
    let running = true;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let scrollY = 0;

    const isHero = mode === 'hero';
    const isCore = mode === 'core';
    const COUNT = Math.round((isHero ? 340 : isCore ? 260 : 70) * intensity);
    const SPARKS: Spark[] = Array.from({ length: isHero ? 44 : isCore ? 70 : 16 }, (_, i) => ({
      a: Math.random() * Math.PI * 2,
      ring: i % 3,
      speed: 0.004 + Math.random() * 0.006,
      size: 1 + Math.random() * 1.8,
    }));

    const ps: P[] = Array.from({ length: COUNT }, () => {
      const depth = 0.35 + Math.random() * 2.4;
      return {
        x: (Math.random() * 2 - 1) * 1.6,
        y: (Math.random() * 2 - 1) * 1.0,
        z: depth,
        vx: (Math.random() - 0.5) * 0.0009,
        vy: (Math.random() - 0.5) * 0.0007,
        vz: (Math.random() - 0.5) * 0.0004,
        r: 0.6 + Math.random() * 1.5,
        hue: Math.floor(Math.random() * 4),
      };
    });

    const stars = Array.from({ length: isHero ? 130 : 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      ph: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    // ResizeObserver is absent in a few embedded/webview environments. The
    // canvas is decorative, so fall back to a window resize listener instead
    // of turning an otherwise usable page into a client-side exception.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    else window.addEventListener('resize', resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      mouse.ty = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    };
    if (parallax) window.addEventListener('mousemove', onMove);
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    if (parallax) window.addEventListener('scroll', onScroll, { passive: true });

    const hueCss = (h: number, a: number) => {
      const [r, g, b] =
        h === 0 ? [139, 92, 246] : h === 1 ? [34, 211, 238] : h === 2 ? [232, 121, 249] : [96, 165, 250];
      return `rgba(${r},${g},${b},${a})`;
    };

    const project = (p: P, cx: number, cy: number) => {
      const f = Math.min(W, H) * 0.55;
      const sx = cx + (p.x * f) / (p.z + 2.2) + mouse.x * (14 / p.z);
      const sy = cy + (p.y * f) / (p.z + 2.2) + mouse.y * (10 / p.z);
      return { x: sx, y: sy, s: 1 / (p.z + 2.2) };
    };

    const draw = (animate: boolean) => {
      t += animate ? 1 : 0;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H * (isHero ? 0.52 : 0.5) - (isHero ? (scrollY % 900) * 0.06 : 0);

      // ---- nebula fog ----
      const nebulas: Array<[number, number, number, number, number]> = [
        [cx * 0.72, cy * 0.62, Math.min(W, H) * 0.55, 0 + (animate ? Math.sin(t * 0.004) * 30 : 0), HUES[0]],
        [cx * 1.3, cy * 0.4, Math.min(W, H) * 0.5, 1 + (animate ? Math.cos(t * 0.003) * 40 : 0), HUES[1]],
        [cx * 0.4, cy * 1.25, Math.min(W, H) * 0.45, 2 + (animate ? Math.sin(t * 0.005 + 2) * 34 : 0), HUES[2]],
        [cx * 1.15, cy * 1.3, Math.min(W, H) * 0.4, 3 + (animate ? Math.cos(t * 0.004 + 1) * 26 : 0), HUES[3]],
      ];
      for (const [nx, ny, nr, h, ph] of nebulas) {
        const [r, g, b] =
          ph === 0 ? [139, 92, 246] : ph === 1 ? [34, 211, 238] : ph === 2 ? [232, 121, 249] : [96, 165, 250];
        const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        grad.addColorStop(0, `rgba(${r},${g},${b},${isHero ? 0.13 : 0.16})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // ---- starfield ----
      for (const s of stars) {
        const tw = animate ? 0.5 + 0.5 * Math.sin(t * 0.02 + s.ph) : 0.8;
        ctx.fillStyle = `rgba(220,225,255,${0.25 * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- perspective grid floor (hero) ----
      if (isHero) {
        const horizon = H * 0.74;
        const vpx = cx + mouse.x * 40;
        ctx.strokeStyle = 'rgba(120,130,255,0.10)';
        ctx.lineWidth = 1;
        for (let i = -14; i <= 14; i++) {
          ctx.beginPath();
          ctx.moveTo(vpx, horizon);
          ctx.lineTo(vpx + i * (W / 12), H + 40);
          ctx.stroke();
        }
        for (let j = 0; j < 9; j++) {
          const yy = horizon + Math.pow(j / 8, 1.8) * (H - horizon) * 1.15;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(W, yy);
          ctx.globalAlpha = 0.5 - j * 0.04;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ---- particles ----
      const proj = ps.map((p) => {
        if (animate) {
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;
          if (p.x > 1.7) p.x = -1.7;
          if (p.x < -1.7) p.x = 1.7;
          if (p.y > 1.1) p.y = -1.1;
          if (p.y < -1.1) p.y = 1.1;
          if (p.z > 2.8) p.z = 0.35;
          if (p.z < 0.3) p.z = 2.8;
        }
        return project(p, cx, cy);
      });
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const q = proj[i];
        if (q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) continue;
        ctx.fillStyle = hueCss(p.hue, HUE_ALPHAS[p.hue] * Math.min(1, q.s * 1.6));
        ctx.beginPath();
        ctx.arc(q.x, q.y, p.r * q.s * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- light trails between near particles ----
      ctx.lineWidth = 0.6;
      const maxD = 90;
      for (let i = 0; i < proj.length; i += 3) {
        for (let j = i + 3; j < proj.length; j += 3) {
          const a = proj[i];
          const b = proj[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            const alpha = (1 - Math.sqrt(d2) / maxD) * 0.16;
            ctx.strokeStyle = hueCss(ps[i].hue, alpha);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // ---- energy beams core → edge anchors ----
      const coreX = cx;
      const coreY = cy - (isHero ? H * 0.04 : 0);
      if (isHero || isCore) {
        const anchors = 8;
        for (let i = 0; i < anchors; i++) {
          const ang = (i / anchors) * Math.PI * 2 + (animate ? t * 0.0012 : 0.4);
          const len = Math.max(W, H) * (isHero ? 0.62 : 0.5);
          const ex = coreX + Math.cos(ang) * len;
          const ey = coreY + Math.sin(ang) * len * 0.62;
          const grad = ctx.createLinearGradient(coreX, coreY, ex, ey);
          grad.addColorStop(0, hueCss(i % 4, 0.3));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([2, 9]);
          ctx.lineDashOffset = animate ? -t * 0.6 : 0;
          ctx.beginPath();
          ctx.moveTo(coreX, coreY);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ---- AI energy core ----
      const coreR = Math.min(W, H) * (isCore ? 0.16 : isHero ? 0.11 : 0.2);
      const pulse = animate ? 1 + 0.05 * Math.sin(t * 0.045) : 1;
      const cr = coreR * pulse;

      const halo = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, cr * 3.2);
      halo.addColorStop(0, 'rgba(190,160,255,0.5)');
      halo.addColorStop(0.25, 'rgba(139,92,246,0.22)');
      halo.addColorStop(0.6, 'rgba(34,211,238,0.07)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(coreX, coreY, cr * 3.2, 0, Math.PI * 2);
      ctx.fill();

      const nucleus = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, cr);
      nucleus.addColorStop(0, 'rgba(240,235,255,0.98)');
      nucleus.addColorStop(0.35, 'rgba(180,140,255,0.85)');
      nucleus.addColorStop(0.75, 'rgba(120,80,240,0.4)');
      nucleus.addColorStop(1, 'rgba(60,40,160,0)');
      ctx.fillStyle = nucleus;
      ctx.beginPath();
      ctx.arc(coreX, coreY, cr, 0, Math.PI * 2);
      ctx.fill();

      // rotating arcs
      for (let ring = 0; ring < 3; ring++) {
        const rr = cr * (1.35 + ring * 0.42);
        const base = animate ? t * (0.01 + ring * 0.004) * (ring % 2 ? -1 : 1) : ring * 2;
        ctx.strokeStyle = hueCss(ring % 4, 0.5);
        ctx.lineWidth = 1.4;
        ctx.shadowColor = hueCss(ring % 4, 0.8);
        ctx.shadowBlur = 10;
        for (let a = 0; a < 3; a++) {
          const start = base + (a * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.ellipse(coreX, coreY, rr, rr * (0.32 + ring * 0.12), ring * 0.5, start, start + 0.9);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // orbiting sparks
      for (const s of SPARKS) {
        if (animate) s.a += s.speed;
        const rr = cr * (1.35 + s.ring * 0.42);
        const tilt = 0.32 + s.ring * 0.12;
        const ox = Math.cos(s.a) * rr;
        const oy = Math.sin(s.a) * rr * tilt;
        const rot = s.ring * 0.5;
        const px = coreX + ox * Math.cos(rot) - oy * Math.sin(rot);
        const py = coreY + ox * Math.sin(rot) + oy * Math.cos(rot);
        ctx.fillStyle = hueCss(s.ring % 4, 0.9);
        ctx.shadowColor = hueCss(s.ring % 4, 0.9);
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // expanding pulse rings (core mode)
      if (isCore && animate) {
        const phase = (t % 240) / 240;
        ctx.strokeStyle = `rgba(160,140,255,${0.35 * (1 - phase)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(coreX, coreY, cr * (1 + phase * 4.2), 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const loop = () => {
      if (!running) return;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      draw(true);
      raf = requestAnimationFrame(loop);
    };

    if (rm) {
      draw(false); // one cinematic still for reduced motion
    } else {
      const onVis = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(raf);
        } else if (!running) {
          running = true;
          loop();
        }
      };
      document.addEventListener('visibilitychange', onVis);
      loop();
      return () => {
        running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVis);
        if (parallax) {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('scroll', onScroll);
        }
        ro?.disconnect();
        if (!ro) window.removeEventListener('resize', resize);
      };
    }
    return () => {
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', resize);
      if (parallax) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('scroll', onScroll);
      }
    };
  }, [mode, intensity, parallax, rm]);

  return <canvas ref={ref} className={className} aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />;
}
