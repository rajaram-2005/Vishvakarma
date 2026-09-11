/**
 * Wireframe geometry + projection math for the 3D digital-twin viewer.
 *
 *   Why: the Aetheris wind-turbine model already has typed channels, bounds,
 *        and a first-order simulator. A real, honest 3D view of the same
 *        asset gives operators something to look at. We are NOT building a
 *        CFD/FEA visualiser; we are drawing the canonical geometry and
 *        overlaying the live state.
 *
 *   What it is:
 *     - Canonical WTG geometry: tower, nacelle, hub, three blades — defined
 *       as a list of 3D vertices and edges. No textures, no shading. Pure
 *       wireframe so the math stays auditable.
 *     - Isometric projection: x' = (x - y) * cos30, y' = (x + y) * sin30 - z.
 *       Pure function, no rounding, no Z-buffer.
 *     - Rotations about the world Y axis (yaw) and the hub Z axis (rotor
 *       spin) so the operator can see the blades move.
 *     - State overlay: each channel in the twin's `state` gets a coloured
 *       indicator at the relevant vertex. Critical bounds → red,
 *       warning → amber, normal → green. This is the same logic the
 *       diagnostics page uses, so the colour matches the spectrum panel.
 *
 *   What it is NOT:
 *     - Not a Three.js / WebGL viewer. We draw into a <canvas> with
 *       moveTo/lineTo/fillRect. No new deps, no shader compilation, no
 *       textured meshes.
 *     - Not a CFD solver. The shape is canonical, not aerodynamically
 *       accurate.
 *     - Not a real-time hardware link. The state is read once on mount
 *       and on the user clicking "Refresh".
 */

import { bearingFaultFrequencies } from "@/aetheris/core/diagnostics/fft";

export type Vec3 = readonly [number, number, number];

export interface WireEdge { a: number; b: number; /** Optional override colour (hex). */ color?: string; }

/**
 * Canonical 2 MW WTG wireframe, in metres. Origin = ground at tower base,
 * +Y = up, +Z = downwind (so the rotor faces +Z by default).
 *
 *   - Tower: a 4-edge prism from (0,0,0) to (0,80,0), radius 3 → 2.
 *   - Nacelle: a 6-vertex box on top of the tower.
 *   - Hub: a single vertex at (0,82,5).
 *   - Blades: three 5-vertex struts from the hub, rotated 120° around Z.
 */
export function canonicalTurbineGeometry(): { vertices: Vec3[]; edges: WireEdge[] } {
  const v: Vec3[] = [];
  const e: WireEdge[] = [];
  const push = (x: number, y: number, z: number) => { v.push([x, y, z]); return v.length - 1; };

  // Tower (8 vertices: 4 bottom ring + 4 top ring)
  const TR = 3; // tower base radius
  const tr = 2; // tower top radius
  const TH = 80; // tower height
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 2 * Math.PI;
    push(Math.cos(a) * TR, 0, Math.sin(a) * TR);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 2 * Math.PI;
    push(Math.cos(a) * tr, TH, Math.sin(a) * tr);
  }
  // Tower vertical edges
  for (let i = 0; i < 4; i++) e.push({ a: i, b: i + 4 });
  // Tower rings (bottom + top)
  for (let i = 0; i < 4; i++) e.push({ a: i, b: (i + 1) % 4 });
  for (let i = 0; i < 4; i++) e.push({ a: i + 4, b: ((i + 1) % 4) + 4 });

  // Nacelle (8 vertices: a rectangular box ~ 4 m long, 3 m wide, 3 m tall)
  const NL = 4, NW = 3, NH = 3;
  const NY = TH + NH / 2; // nacelle centre height
  // 4 corners at front (+Z), 4 corners at back (-Z)
  for (const zs of [+1, -1] as const) {
    for (let i = 0; i < 4; i++) {
      const x = (i & 1) ? NL / 2 : -NL / 2;
      const y = (i & 2) ? NH / 2 : -NH / 2;
      const z = zs * NW / 2;
      push(x, NY + y, z);
    }
  }
  const nacStart = 8;
  for (let i = 0; i < 4; i++) {
    e.push({ a: nacStart + i, b: nacStart + ((i + 1) % 4) });
    e.push({ a: nacStart + 4 + i, b: nacStart + 4 + ((i + 1) % 4) });
    e.push({ a: nacStart + i, b: nacStart + 4 + i });
  }

  // Hub — a single vertex 5 m in front of the nacelle
  const hubIdx = push(0, NY, NW / 2 + 5);
  e.push({ a: 12, b: hubIdx });
  e.push({ a: 13, b: hubIdx });
  e.push({ a: 14, b: hubIdx });
  e.push({ a: 15, b: hubIdx });

  // Three blades from the hub
  const BLADE_LEN = 50;
  const bladeAngles = [0, 120, 240]; // degrees
  for (let i = 0; i < 3; i++) {
    const a = (bladeAngles[i]! * Math.PI) / 180;
    // Each blade: hub → tip1 → tip2 (a thin triangle to give the blade a visible width)
    const tip1 = push(Math.cos(a) * BLADE_LEN, NY + 0.5, NW / 2 + 5 + Math.sin(a) * BLADE_LEN * 0.0);
    const tip2 = push(Math.cos(a) * BLADE_LEN, NY - 0.5, NW / 2 + 5 + Math.sin(a) * BLADE_LEN * 0.0);
    e.push({ a: hubIdx, b: tip1, color: "#9ca3af" });
    e.push({ a: hubIdx, b: tip2, color: "#9ca3af" });
    e.push({ a: tip1, b: tip2, color: "#9ca3af" });
    // Add a mid-blade marker so the rotation is visible
    const mid = push(Math.cos(a) * BLADE_LEN * 0.6, NY, NW / 2 + 5 + Math.sin(a) * BLADE_LEN * 0.6 * 0.0);
    e.push({ a: hubIdx, b: mid, color: "#475569" });
  }

  return { vertices: v, edges: e };
}

export interface ProjectedPoint { x: number; y: number; depth: number; }
export interface ProjectedEdge { a: ProjectedPoint; b: ProjectedPoint; color?: string; }
export interface ProjectedScene {
  width: number; height: number; scale: number; originX: number; originY: number;
  points: ProjectedPoint[];
  edges: ProjectedEdge[];
}

/** Isometric projection. The 'yaw' rotates the model about the world Y axis; 'spin' rotates the rotor about the hub Z axis. */
export function projectScene(opts: {
  vertices: readonly Vec3[];
  edges: readonly WireEdge[];
  yaw?: number; // radians
  spin?: number; // radians (rotor)
  width: number; height: number;
  scale?: number;
  originX?: number;
  originY?: number;
}): ProjectedScene {
  const yaw = opts.yaw ?? 0;
  const spin = opts.spin ?? 0;
  // Find the hub index by convention: vertex pushed with hubIdx=16 in canonicalTurbineGeometry
  // (we recompute by finding the vertex farthest in +Z direction)
  let hubZ = -Infinity; let hubIdx = 0;
  for (let i = 0; i < opts.vertices.length; i++) {
    if (opts.vertices[i]![2] > hubZ) { hubZ = opts.vertices[i]![2]; hubIdx = i; }
  }
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosS = Math.cos(spin), sinS = Math.sin(spin);
  const hub = opts.vertices[hubIdx]!;
  // A vertex is a "blade" if its Z is within ~1 m of the hub's Z (i.e., it
  // is part of the rotor disk and should spin with the rotor). Everything
  // else is static (tower, nacelle, hub itself).
  const BLADE_Z_TOLERANCE = 2.0;
  const isBlade = (z: number) => Math.abs(z - hub[2]) < BLADE_Z_TOLERANCE && (z >= hub[2] - 0.01); // exclude nacelle back face
  // Apply yaw to all vertices, then spin only to blade vertices.
  const rotated: Vec3[] = opts.vertices.map((p) => {
    // 1) yaw about Y
    const x1 = p[0] * cosY + p[2] * sinY;
    const y1 = p[1];
    const z1 = -p[0] * sinY + p[2] * cosY;
    // 2) spin about hub Z (rotate X-Y plane around the hub's Z line) —
    //    only if this vertex is a blade.
    if (!isBlade(z1)) return [x1, y1, z1] as Vec3;
    const dx = x1 - hub[0];
    const dy = y1 - hub[1];
    const x2 = hub[0] + dx * cosS - dy * sinS;
    const y2 = hub[1] + dx * sinS + dy * cosS;
    return [x2, y2, z1] as Vec3;
  });
  // Project to 2D (isometric)
  // x' = (x - y) * cos30, y' = (x + y) * sin30 - z
  // We'll then apply a screen scale + translation.
  const COS30 = Math.cos(Math.PI / 6);
  const SIN30 = Math.sin(Math.PI / 6);
  const raw = rotated.map((p): { x: number; y: number; depth: number } => ({
    x: (p[0] - p[1]) * COS30,
    y: (p[0] + p[1]) * SIN30 - p[2],
    depth: p[0] + p[1] + p[2],
  }));
  // Compute bounds to auto-fit
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of raw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Centre the scene at the geometric centre of the tower (origin in world
  // coords) so the tower doesn't appear to drift when the rotor spins. The
  // tower centre is (0, 40, 0); we project it once and use the result
  // as the fixed reference point.
  const cos30 = Math.cos(Math.PI / 6), sin30 = Math.sin(Math.PI / 6);
  const refWorld: Vec3 = [0, 40, 0];
  const ry = refWorld[0] * cosY + refWorld[2] * sinY;
  const ry1 = refWorld[1];
  const rz1 = -refWorld[0] * sinY + refWorld[2] * cosY;
  const refX = (ry - ry1) * cos30;
  const refY = (ry + ry1) * sin30 - rz1;
  // Auto-scale: pick the scale that keeps the farthest point within the
  // canvas, measured from the reference (not from the bbox centre).
  const dists = raw.map((p) => Math.max(Math.abs(p.x - refX), Math.abs(p.y - refY)));
  const maxDist = Math.max(1, ...dists);
  const autoScale = Math.min((opts.width / 2 - 10) / maxDist, (opts.height / 2 - 10) / maxDist);
  const scale = opts.scale ?? autoScale;
  const ox = opts.originX ?? opts.width / 2;
  const oy = opts.originY ?? opts.height / 2;
  const points = raw.map((p) => ({
    x: ox + (p.x - refX) * scale,
    y: oy - (p.y - refY) * scale,
    depth: p.depth,
  }));
  const edges: ProjectedEdge[] = opts.edges.map((ed) => {
    const a = points[ed.a]!;
    const b = points[ed.b]!;
    return { a, b, color: ed.color };
  });
  return { width: opts.width, height: opts.height, scale, originX: ox, originY: oy, points, edges };
}

/** Draw a projected scene to a canvas 2d context. Edges are drawn from farthest (highest depth) to nearest so the front is on top. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: ProjectedScene, opts?: { edgeColor?: string; lineWidth?: number }): void {
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.lineWidth = opts?.lineWidth ?? 1.5;
  // Sort edges by average depth, descending (back edges first)
  const sorted = scene.edges.slice().sort((a, b) => (b.a.depth + b.b.depth) - (a.a.depth + a.b.depth));
  for (const e of sorted) {
    ctx.strokeStyle = e.color ?? opts?.edgeColor ?? "#9ca3af";
    ctx.beginPath();
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
    ctx.stroke();
  }
}

/** Severity bucket for a value, given ISO 10816 vibration thresholds (4.5/7.1/11.2 mm/s) or a custom bound. */
export function severityFor(value: number, bounds?: { min?: number; max?: number; critical?: boolean }): "ok" | "watch" | "warning" | "critical" {
  if (!bounds || bounds.max === undefined) {
    // Default to ISO 10816 vibration thresholds
    if (value < 4.5) return "ok";
    if (value < 7.1) return "watch";
    if (value < 11.2) return "warning";
    return "critical";
  }
  const max = bounds.max;
  const min = bounds.min ?? -Infinity;
  if (value > max || value < min) return "critical";
  if (bounds.critical) {
    if (value > max * 0.9 || value < min * 1.1) return "warning";
    if (value > max * 0.75 || value < min * 1.25) return "watch";
    return "ok";
  }
  if (value > max * 0.9) return "warning";
  if (value > max * 0.75) return "watch";
  return "ok";
}

export const SEVERITY_COLOURS: Record<"ok" | "watch" | "warning" | "critical", string> = {
  ok: "#4ade80",
  watch: "#facc15",
  warning: "#fb923c",
  critical: "#f87171",
};

/**
 * Read a state value and return a small overlay for the 3D view:
 *   {label, value, unit, severity, color, x, y, z} — the (x, y, z) is the
 *   vertex where the label should be drawn (so the operator can see which
 *   part of the asset the channel belongs to).
 */
export function overlayFromState(state: Record<string, number | string | boolean>, bounds: { key: string; min?: number; max?: number; critical?: boolean; unit?: string }[]): { key: string; value: number; unit: string; severity: "ok" | "watch" | "warning" | "critical"; x: number; y: number; z: number }[] {
  const out: { key: string; value: number; unit: string; severity: "ok" | "watch" | "warning" | "critical"; x: number; y: number; z: number }[] = [];
  for (const b of bounds) {
    const v = state[b.key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const sev = severityFor(v, { min: b.min, max: b.max, critical: b.critical });
    // Pick a vertex based on the channel name. Honest heuristic: it's a
    // placement on the canonical geometry that operators can learn.
    let xyz: Vec3 = [0, 0, 0];
    if (/rotor|blade/i.test(b.key)) xyz = [40, 82, 5];
    else if (/gearbox|drivetrain/i.test(b.key)) xyz = [0, 81.5, 0];
    else if (/nacelle|yaw/i.test(b.key)) xyz = [0, 82, 0];
    else if (/tower|base/i.test(b.key)) xyz = [0, 10, 0];
    else if (/wind/i.test(b.key)) xyz = [0, 95, 0];
    else if (/temp/i.test(b.key)) xyz = [0, 82, 0];
    else if (/vib/i.test(b.key)) xyz = [0, 81.5, 0];
    else if (/power|kw/i.test(b.key)) xyz = [0, 82, -1.5];
    out.push({ key: b.key, value: v, unit: b.unit ?? "", severity: sev, x: xyz[0], y: xyz[1], z: xyz[2] });
  }
  return out;
}

// Re-export the FFT helpers that the viewer uses for the bearing-fault
// frequency markers around the rotor.
export { bearingFaultFrequencies };
