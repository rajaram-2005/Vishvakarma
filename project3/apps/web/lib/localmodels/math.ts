/**
 * Aetherion Math — an own, offline computational model.
 * A real tokenizer + shunting-yard expression evaluator with an equation
 * solver, statistics, primes and unit conversions. No network, no keys.
 */

// ── Expression evaluator (shunting-yard → RPN) ──────────────────────────────

type Tok = { t: 'num' | 'id' | 'op' | 'lp' | 'rp'; v: string };

const OPS: Record<string, { prec: number; right?: boolean; fn: (a: number, b?: number) => number }> = {
  '+': { prec: 2, fn: (a, b) => a + b! },
  '-': { prec: 2, fn: (a, b) => a - b! },
  '*': { prec: 3, fn: (a, b) => a * b! },
  '/': { prec: 3, fn: (a, b) => a / b! },
  '%': { prec: 3, fn: (a, b) => a % b! },
  '^': { prec: 4, right: true, fn: (a, b) => Math.pow(a, b!) },
  'u-': { prec: 5, right: true, fn: (a) => -a },
};

const FN1: Record<string, (a: number) => number> = {
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  log: Math.log10, ln: Math.log, exp: Math.exp, asin: Math.asin, acos: Math.acos,
};
const FN2: Record<string, (a: number, b: number) => number> = {
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src: string): Tok[] {
  const s = src.replace(/[×x]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^').replace(/π/g, 'pi');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: 'num', v: s.slice(i, j) }); i = j; continue;
    }
    if (/[a-z_]/i.test(c)) {
      let j = i; while (j < s.length && /[a-z0-9_]/i.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j).toLowerCase() }); i = j; continue;
    }
    if ('+-*/%^'.includes(c)) {
      const prev = out[out.length - 1];
      const unary = c === '-' && (!prev || prev.t === 'op' || prev.t === 'lp');
      out.push(unary ? { t: 'op', v: 'u-' } : { t: 'op', v: c }); i++; continue;
    }
    if (c === '(') { out.push({ t: 'lp', v: c }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp', v: c }); i++; continue; }
    if (c === ',') { out.push({ t: 'op', v: ',' }); i++; continue; }
    i++;
  }
  return out;
}

/** Evaluate `expr` with an optional variable binding (used by the solver). */
export function evalExpr(expr: string, vars: Record<string, number> = {}): number | null {
  const toks = tokenize(expr);
  const out: Tok[] = [];
  const stack: Tok[] = [];
  for (const tk of toks) {
    if (tk.t === 'num' || tk.t === 'id') { out.push(tk); continue; }
    if (tk.t === 'lp') { stack.push(tk); continue; }
    if (tk.t === 'rp') {
      while (stack.length && stack[stack.length - 1].t !== 'lp') out.push(stack.pop()!);
      if (!stack.length) return null;
      stack.pop();
      if (stack.length && stack[stack.length - 1].t === 'id') out.push(stack.pop()!); // function call
      continue;
    }
    const o = OPS[tk.v] ?? { prec: tk.v === ',' ? 0 : 1 };
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.t === 'lp') break;
      const to = OPS[top.v] ?? { prec: 0 };
      if (o.prec < to.prec || (o.prec === to.prec && !o.right)) out.push(stack.pop()!);
      else break;
    }
    stack.push(tk);
  }
  while (stack.length) out.push(stack.pop()!);

  const st: number[] = [];
  for (const tk of out) {
    if (tk.t === 'num') st.push(parseFloat(tk.v));
    else if (tk.t === 'id') {
      if (tk.v in CONSTS) st.push(CONSTS[tk.v]);
      else if (tk.v in FN1) {
        const a = st.pop(); if (a === undefined) return null;
        st.push(FN1[tk.v](a));
      } else if (tk.v in FN2) {
        const b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) return null;
        st.push(FN2[tk.v](a, b));
      } else if (tk.v in vars) st.push(vars[tk.v]);
      else return null;
    } else {
      const o = OPS[tk.v];
      if (!o) return null;
      if (tk.v === 'u-') { const a = st.pop(); if (a === undefined) return null; st.push(-a); }
      else { const b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) return null; st.push(o.fn(a, b)); }
    }
  }
  return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null;
}

// ── Equation solver ─────────────────────────────────────────────────────────

function solveEquation(text: string): string {
  const m = text.match(/([0-9a-z\s.+\-*/^()]+?)=([0-9a-z\s.+\-*/^()]+)/i);
  if (!m) return '';
  const lhs = m[1].trim(), rhs = m[2].trim();
  const hasVar = /[a-z]/i.test(lhs) || /[a-z]/i.test(rhs);
  if (!hasVar || !/\d/.test(lhs + rhs)) return '';
  const side = /[a-z]/i.test(lhs) ? lhs : rhs;
  const other = /[a-z]/i.test(lhs) ? rhs : lhs;
  const sign = /[a-z]/i.test(lhs) ? 1 : -1;
  const varName = (side.match(/[a-z]+/i) ?? ['x'])[0].toLowerCase();

  const f = (x: number): number | null => {
    const v1 = evalExpr(side, { [varName]: x });
    const v2 = evalExpr(other, { [varName]: x });
    if (v1 === null || v2 === null) return null;
    return sign * (v1 - v2);
  };
  // linear fast path: f(x) = ax + b
  const f0 = f(0), f1 = f(1);
  if (f0 !== null && f1 !== null) {
    const a = f1 - f0;
    if (Math.abs(a) > 1e-12) {
      const root = -f0 / a;
      if (Math.abs(f(root) ?? 1) < 1e-6) return `**${varName} = ${fmt(root)}**`;
    }
  }
  // bisection fallback
  let lo = -1e6, hi = 1e6;
  const flo = f(lo), fhi = f(hi);
  if (flo === null || fhi === null) return '';
  if (flo * fhi > 0) return ''; // no sign change on scan range
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === null) return '';
    if (Math.abs(fm) < 1e-9) return `**${varName} = ${fmt(mid)}**`;
    if (flo * fm < 0) hi = mid; else lo = mid;
  }
  const root = (lo + hi) / 2;
  return `**${varName} = ${fmt(root)}**`;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const r = Math.round(n * 1e8) / 1e8;
  return String(r);
}

// ── Statistics, primes, conversions ─────────────────────────────────────────

function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / a.length; }
function median(a: number[]) { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mode(a: number[]) { const c = new Map<number, number>(); for (const v of a) c.set(v, (c.get(v) ?? 0) + 1); return [...c.entries()].sort((x, y) => y[1] - x[1])[0]; }
function stddev(a: number[]) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }

function stats(text: string): string {
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter((n) => Number.isFinite(n)) ?? [];
  if (nums.length < 2) return '';
  const [mo, mc] = mode(nums);
  return [
    `**Dataset** — ${nums.length} values: ${nums.slice(0, 12).join(', ')}${nums.length > 12 ? ', …' : ''}`,
    `sum = ${fmt(nums.reduce((a, b) => a + b, 0))}`,
    `mean = ${fmt(mean(nums))}`,
    `median = ${fmt(median(nums))}`,
    `min = ${fmt(Math.min(...nums))} · max = ${fmt(Math.max(...nums))}`,
    `mode = ${fmt(mo)} (×${mc})`,
    `std dev = ${fmt(stddev(nums))}`,
  ].join('\n');
}

function primes(text: string): string {
  const isPrime = (n: number) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
  const factors = (n: number) => { const f: number[] = []; let d = 2; while (d * d <= n) { while (n % d === 0) { f.push(d); n /= d; } d++; } if (n > 1) f.push(n); return f; };
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const n = parseInt(text.match(/\d+/)?.[0] ?? '', 10);
  if (!Number.isFinite(n) || n < 1 || n > 1e15) return '';
  const t = text.toLowerCase();
  if (/factor/.test(t)) { const f = factors(n); return `**${n} = ${f.join(' × ')}**`; }
  if (/gcd/.test(t)) { const m = parseInt(text.match(/\d+/g)?.[1] ?? '', 10); return Number.isFinite(m) ? `**gcd(${n}, ${m}) = ${gcd(n, m)}**` : ''; }
  if (/lcm/.test(t)) { const m = parseInt(text.match(/\d+/g)?.[1] ?? '', 10); return Number.isFinite(m) ? `**lcm(${n}, ${m}) = ${(n / gcd(n, m)) * m}**` : ''; }
  if (/prime/.test(t)) return `**${n} is ${isPrime(n) ? 'prime' : `not prime (${factors(n).slice(0, 4).join(' × ')}…)`}**`;
  return '';
}

const UNITS: Record<string, { to: string; k: number; linear?: (v: number) => number }> = {
  km: { to: 'mi', k: 0.621371 }, mi: { to: 'km', k: 1.609344 },
  kg: { to: 'lb', k: 2.204623 }, lb: { to: 'kg', k: 0.453592 },
  cm: { to: 'in', k: 0.393701 }, in: { to: 'cm', k: 2.54 },
  m: { to: 'ft', k: 3.28084 }, ft: { to: 'm', k: 0.3048 },
  c: { to: 'f', k: 1, linear: (v: number) => (v * 9) / 5 + 32 },
  f: { to: 'c', k: 1, linear: (v: number) => ((v - 32) * 5) / 9 },
  l: { to: 'gal', k: 0.264172 }, gal: { to: 'l', k: 3.785412 },
};

function convert(text: string): string {
  const t = text.toLowerCase();
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:to|in|into|as)\s+([a-z]+)/);
  if (!m) return '';
  const unit = UNITS[m[2]];
  if (!unit) return '';
  const v = parseFloat(m[1]);
  const out = unit.linear ? unit.linear(v) : v * unit.k;
  return `**${fmt(v)} ${m[2]} = ${fmt(out)} ${m[3]}**`;
}

function percent(text: string): string {
  const m = text.toLowerCase().match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d+(?:\.\d+)?)/);
  if (!m) return '';
  return `**${m[1]}% of ${m[2]} = ${fmt((parseFloat(m[1]) / 100) * parseFloat(m[2]))}**`;
}

/** The math model's entry point. Returns '' when the prompt is not math. */
export function mathAnswer(prompt: string): string {
  const t = prompt.trim();
  const lower = t.toLowerCase();
  try {
    if (/=/.test(t) && /[a-z]/i.test(t) && (/\d/.test(t))) { const sol = solveEquation(t); if (sol) return `${sol}\n\nSolved on-device by Aetherion Math (bisection + linear solver).`; }
    if (/factor|gcd|lcm|prime/.test(lower)) { const p = primes(t); if (p) return p; }
    if (/\b(to|in|into|as)\b/.test(lower) && /\d/.test(t)) { const c = convert(t); if (c) return c; }
    if (/percent\s+of|%\s+of/.test(lower)) { const p = percent(t); if (p) return p; }
    if (/mean|median|mode|average|std|stats|deviation/.test(lower)) { const s = stats(t); if (s) return `${s}\n\nComputed on-device by Aetherion Math.`; }
    const expr = t.replace(/[?=!.,;]+$/g, '').replace(/^(what is|whats|calculate|compute|evaluate|solve|how much is)\s+/i, '');
    const v = evalExpr(expr);
    if (v !== null) return `**${expr.trim()} = ${fmt(v)}**\n\nComputed on-device by Aetherion Math (shunting-yard evaluator).`;
  } catch {
    /* fall through */
  }
  return '';
}
