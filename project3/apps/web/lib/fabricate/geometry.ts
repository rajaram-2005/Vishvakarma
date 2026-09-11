// SUTRA Fabricate — procedural 3D geometry.
// Deterministic, dependency-free mesh generation from a prompt's keyword
// signature. Everything here is pure and testable; the browser renders the
// meshes with a canvas preview and exports OBJ/GLTF.

export interface Mesh {
  name: string;
  /** flat xyz triplets */
  positions: number[];
  /** triangle indices */
  indices: number[];
}

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushQuad(indices: number[], a: number, b: number, c: number, d: number) {
  indices.push(a, b, c, a, c, d);
}

/** UV-sphere (or ellipsoid when scale is given). */
export function makeSphere(rx: number, ry: number, rz: number, lat = 24, lon = 36): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      positions.push(rx * Math.sin(th) * Math.cos(ph), ry * Math.cos(th), rz * Math.sin(th) * Math.sin(ph));
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j;
      const b = a + lon + 1;
      pushQuad(indices, a, a + 1, b + 1, b);
    }
  }
  return { name: 'sphere', positions, indices };
}

/** Torus / ring. */
export function makeTorus(R: number, r: number, seg = 48, tube = 18, twist = 0): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= tube; j++) {
      const v = (j / tube) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const rr = r * (1 + 0.25 * Math.sin(u * 3 + twist));
      const x = (R + rr * cv) * cu;
      const y = rr * sv;
      const z = (R + rr * cv) * su;
      positions.push(x, y, z);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * (tube + 1) + j;
      const b = a + tube + 1;
      pushQuad(indices, a, a + 1, b + 1, b);
    }
  }
  return { name: 'torus', positions, indices };
}

/** Cylinder (open or with caps). */
export function makeCylinder(rTop: number, rBottom: number, h: number, seg = 32): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    positions.push(rTop * Math.cos(a), h / 2, rTop * Math.sin(a));
  }
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    positions.push(rBottom * Math.cos(a), -h / 2, rBottom * Math.sin(a));
  }
  for (let j = 0; j < seg; j++) {
    const n = (j + 1) % seg;
    pushQuad(indices, j, n, seg + n, seg + j);
  }
  // caps
  const tc = positions.length / 3;
  positions.push(0, h / 2, 0);
  for (let j = 0; j < seg; j++) indices.push(tc, (j + 1) % seg, j);
  const bc = positions.length / 3;
  positions.push(0, -h / 2, 0);
  for (let j = 0; j < seg; j++) indices.push(bc, seg + j, seg + ((j + 1) % seg));
  return { name: 'cylinder', positions, indices };
}

/** Lathe (vase-like) from a radius profile. */
export function makeLathe(profile: number[], seg = 48): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const y = (i / (n - 1)) * 2 - 1;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      positions.push(profile[i] * Math.cos(a), y, profile[i] * Math.sin(a));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      pushQuad(indices, a, a + 1, b + 1, b);
    }
  }
  // close bottom
  const bc = positions.length / 3;
  positions.push(0, -1, 0);
  for (let j = 0; j < seg; j++) indices.push(bc, (j + 1) % (seg + 1), j);
  return { name: 'lathe', positions, indices };
}

/** Height-field terrain (mountains / dunes). */
export function makeTerrain(size: number, fn: (x: number, z: number) => number, cells = 40): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const x = (i / cells - 0.5) * size;
      const z = (j / cells - 0.5) * size;
      positions.push(x, fn(x, z), z);
    }
  }
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = i * (cells + 1) + j;
      const b = a + cells + 1;
      pushQuad(indices, a, a + 1, b + 1, b);
    }
  }
  return { name: 'terrain', positions, indices };
}

/** Twisted box — a box extruded along y with a twist. */
export function makeTwistedBox(w: number, d: number, h: number, twist: number, layers = 40): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= layers; i++) {
    const y = (i / layers - 0.5) * h;
    const ang = twist * (i / layers);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (const [px, pz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ]) {
      positions.push(px * ca - pz * sa, y, px * sa + pz * ca);
    }
  }
  for (let i = 0; i < layers; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j;
      const b = a + 4;
      pushQuad(indices, a, ((a + 1) % 4) + i * 4, ((a + 1) % 4) + (i + 1) * 4, b);
    }
  }
  return { name: 'twisted-box', positions, indices };
}

/** Simple rocket: a revolved profile with a nose cone and body taper. */
export function makeRocket(): Mesh {
  const m = makeLathe([0.02, 0.15, 0.34, 0.5, 0.5, 0.48, 0.46, 0.5, 0.5, 0.5, 0.5, 0.5], 40);
  m.name = 'rocket';
  return m;
}

const HILLS = (rnd: () => number, amp: number, freq: number) => {
  const oct = (x: number, z: number, f: number, a: number) => {
    const s = Math.sin(x * f) * Math.cos(z * f * 0.9) + Math.sin(x * f * 0.5 + 1.7) * Math.cos(z * f * 0.7);
    return s * a;
  };
  return (x: number, z: number) => {
    let v = 0;
    let f = freq;
    let a = amp;
    for (let i = 0; i < 4; i++) {
      v += oct(x, z, f, a);
      f *= 2.1;
      a *= 0.45;
    }
    return v + rnd() * 0.02;
  };
};

/** Picks a deterministic mesh family from the prompt's keywords. */
export function meshFromPrompt(prompt: string): Mesh {
  const p = prompt.toLowerCase();
  const seed = hashSeed(prompt);
  const rnd = rngFrom(seed);
  const R = 0.8 + rnd() * 0.4;

  if (/(gear|cog|wheel)/.test(p)) {
    // gear: torus with deep periodic radius modulation
    const base = makeTorus(R, R * 0.22, 24, 12, 6);
    base.name = 'gear';
    return base;
  }
  if (/(torus|ring|donut|orbit)/.test(p)) {
    return makeTorus(R, 0.24 + rnd() * 0.2, 56, 20, (rnd() - 0.5) * 4);
  }
  if (/(mountain|terrain|landscape|island|dune)/.test(p)) {
    return makeTerrain(4, HILLS(rnd, 0.55 + rnd() * 0.5, 1.6 + rnd() * 0.8), 44);
  }
  if (/(vase|lathe|cup|goblet|bowl)/.test(p)) {
    const prof = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const curve = Math.sin(t * Math.PI * (0.6 + rnd() * 0.6));
      return 0.16 + curve * (0.5 + rnd() * 0.35);
    });
    prof[0] = 0.03;
    return makeLathe(prof, 48);
  }
  if (/(tower|skyscraper|twist|spiral|tornado)/.test(p)) {
    return makeTwistedBox(1.0 + rnd() * 0.5, 1.0 + rnd() * 0.5, 2.4 + rnd(), 2 + rnd() * 6, 48);
  }
  if (/(rocket|missile|shuttle|spaceship)/.test(p)) {
    return makeRocket();
  }
  if (/(pillar|column|cylinder|pipe)/.test(p)) {
    return makeCylinder(0.35 + rnd() * 0.25, 0.35 + rnd() * 0.25, 2 + rnd() * 1.5, 36);
  }
  if (/(cube|box|block|brick)/.test(p)) {
    return makeTwistedBox(1.4, 1.4, 1.4, 0, 2);
  }
  if (/(egg|ellipsoid|pebble|stone|planet|ball|sphere)/.test(p)) {
    return makeSphere(0.7 + rnd() * 0.4, 0.8 + rnd() * 0.5, 0.7 + rnd() * 0.4, 26, 38);
  }
  // default: gently deformed ellipsoid "monolith"
  return makeSphere(0.7, 1.2 + rnd() * 0.4, 0.5, 26, 38);
}

/** A short human-readable label for the generated object. */
export function meshLabel(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/(gear|cog|wheel)/.test(p)) return 'gear';
  if (/(torus|ring|donut|orbit)/.test(p)) return 'ring';
  if (/(mountain|terrain|landscape|island|dune)/.test(p)) return 'terrain';
  if (/(vase|lathe|cup|goblet|bowl)/.test(p)) return 'vase';
  if (/(tower|skyscraper|twist|spiral|tornado)/.test(p)) return 'twisted tower';
  if (/(rocket|missile|shuttle|spaceship)/.test(p)) return 'rocket';
  if (/(pillar|column|cylinder|pipe)/.test(p)) return 'column';
  if (/(cube|box|block|brick)/.test(p)) return 'block';
  if (/(egg|ellipsoid|pebble|stone|planet|ball|sphere)/.test(p)) return 'sculpture';
  return 'monolith';
}
