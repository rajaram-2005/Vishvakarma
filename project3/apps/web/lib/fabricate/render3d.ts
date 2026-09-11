// Lumen Fabricate — canvas 3D preview. Painter's-algorithm flat shading,
// no dependencies. Purely visual; the exported OBJ/GLTF carry the real mesh.

import type { Mesh } from './geometry';

export interface RenderFrame {
  /** rotation in radians around Y */
  ry: number;
  rx: number;
  scale: number;
}

export function renderMesh(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  frame: RenderFrame,
  opts?: { width?: number; height?: number },
): void {
  const W = opts?.width ?? ctx.canvas.width;
  const H = opts?.height ?? ctx.canvas.height;

  // bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const s = (Math.min(W, H) * 0.46 * frame.scale) / span;

  const cyr = Math.cos(frame.ry), syr = Math.sin(frame.ry);
  const cxr = Math.cos(frame.rx), sxr = Math.sin(frame.rx);

  // rotate + project
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i] - cx, y = p[i + 1] - cy, z = p[i + 2] - cz;
    // around Y
    let x1 = x * cyr + z * syr, z1 = -x * syr + z * cyr;
    // around X
    let y1 = y * cxr - z1 * sxr, z2 = y * sxr + z1 * cxr;
    pts.push([x1 * s + W / 2, -y1 * s + H / 2, z2]);
  }

  const light = (nx: number, ny: number, nz: number): number => {
    const len = Math.hypot(nx, ny, nz) || 1;
    const l = Math.abs(nx * 0.45 + ny * 0.75 + nz * 0.48) / len;
    return 0.34 + 0.66 * l;
  };

  // face list: avg depth + shade
  const faces: Array<{ z: number; fill: string; tri: number[] }> = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    const [ax, ay, az] = pts[a];
    const [bx, by, bz] = pts[b];
    const [cx2, cy2, cz2] = pts[c];
    // face normal (screen space cross of edges is fine for flat look)
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx2 - ax, vy = cy2 - ay, vz = cz2 - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = light(nx, ny, nz);
    const hue = 262 + Math.round((nz / (Math.abs(nz) + 1)) * 40); // purple→cyan drift
    const lum = Math.round(30 + l * 52);
    faces.push({ z: (az + bz + cz2) / 3, fill: `hsl(${hue} 55% ${lum}%)`, tri: [a, b, c] });
  }
  faces.sort((f1, f2) => f2.z - f1.z); // far → near

  ctx.fillStyle = '#06070f';
  ctx.fillRect(0, 0, W, H);
  // subtle backdrop glow
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
  g.addColorStop(0, 'rgba(139,92,246,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const f of faces) {
    ctx.fillStyle = f.fill;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pts[f.tri[0]][0], pts[f.tri[0]][1]);
    ctx.lineTo(pts[f.tri[1]][0], pts[f.tri[1]][1]);
    ctx.lineTo(pts[f.tri[2]][0], pts[f.tri[2]][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
