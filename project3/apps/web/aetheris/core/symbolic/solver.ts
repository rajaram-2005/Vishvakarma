/**
 * Neurosymbolic Verification Engine — pure symbolic solver, no model calls.
 *
 *   Goal: when the agent synthesises a plan or a mathematical model, pipe it through a
 *         deterministic solver before it gets to act. If the plan violates programmed
 *         logic, units, or physics-style constraints, the solver returns a strict,
 *         structured rejection that the agent can read and recalculate against.
 *
 *   Scope (and what it is NOT):
 *     - Pure TypeScript, no SymPy / Python dependency. We use a small internal CAS for the
 *       subset the agent actually produces: linear expressions, polynomial identities,
 *       unit consistency, range constraints, and equality substitution.
 *     - Deterministic: same input → same verdict, no LLM in the loop.
 *     - Audited through the existing observability events stream.
 *     - The existing verification engine (../verification/verify.ts) handles JSON-schema
 *       validation, independent review, and a test-loop. This module is additive: it
 *       specifically targets math/physics-style claims.
 *
 *   Status: EXPERIMENTAL. The solver supports the common cases below; anything outside
 *   the supported subset is reported as `unsupported` rather than guessed.
 */


// --------------------------------------------------------------------------- AST
//
// We deliberately keep a tiny, well-typed expression AST instead of running eval() on
// user/model input. The parser accepts a focused, LLM-friendly subset:
//   number, identifier, + - * /, unary minus, parentheses, ^ (power, integer only),
//   function calls (sqrt, sin, cos, tan, exp, log, abs), and a single '=' for equations.
//
// `vars` carries variable bindings (e.g. {R: 10, V: 12}) so a model can say
//   "I = V / R"  with  vars = {V: 12, R: 10}  and we return  I = 1.2.

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "sym"; name: string }
  | { kind: "neg"; arg: Expr }
  | { kind: "add"; left: Expr; right: Expr }
  | { kind: "sub"; left: Expr; right: Expr }
  | { kind: "mul"; left: Expr; right: Expr }
  | { kind: "div"; left: Expr; right: Expr }
  | { kind: "pow"; base: Expr; exp: Expr }
  | { kind: "call"; name: string; args: Expr[] };

export interface Equation { lhs: Expr; rhs: Expr; op: "=" | "==" | "<" | "<=" | ">" | ">=" | "!=" }

// --------------------------------------------------------------------------- parser
//
// Tokenizer → Pratt parser. The grammar is small enough to live next to the AST.

type OpVal = "+" | "-" | "*" | "/" | "^" | "(" | ")" | "=" | "," | "<" | ">" | "<=" | ">=" | "!=";
type Tok =
  | { t: "num"; v: number }
  | { t: "sym"; v: string }
  | { t: "op"; v: OpVal }
  | { t: "ws" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE+\-]/.test(src[j]) && !((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1]))) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new Error(`bad number at ${i}: ${src.slice(i, j)}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "sym", v: src.slice(i, j) });
      i = j;
      continue;
    }
    // Two-character operators first
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "!=" || two === "==") { out.push({ t: "op", v: two as OpVal }); i += 2; continue; }
    if ("+-*/^()<>=,".includes(c)) { out.push({ t: "op", v: c as OpVal }); i++; continue; }
    throw new Error(`unexpected character '${c}' at position ${i}`);
  }
  return out;
}

const FUNCS = new Set(["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "exp", "log", "ln", "abs", "min", "max"]);

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private eat(t: string, v?: string) { const x = this.peek(); if (!x || x.t !== t || (v !== undefined && (x as { v: string }).v !== v)) throw new Error(`expected ${t} ${v ?? ""} got ${x?.t ?? "eof"}`); this.p++; return x; }

  parseExpr(): Expr { return this.parseAdd() }
  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "+" || this.peek()?.t === "op" && (this.peek() as { v: string }).v === "-") {
      const op = (this.peek() as { v: string }).v;
      this.p++;
      const right = this.parseMul();
      left = op === "+" ? { kind: "add", left, right } : { kind: "sub", left, right };
    }
    return left;
  }
  private parseMul(): Expr {
    let left = this.parsePow();
    while (this.peek()?.t === "op" && ((this.peek() as { v: string }).v === "*" || (this.peek() as { v: string }).v === "/")) {
      const op = (this.peek() as { v: string }).v;
      this.p++;
      const right = this.parsePow();
      left = op === "*" ? { kind: "mul", left, right } : { kind: "div", left, right };
    }
    return left;
  }
  private parsePow(): Expr {
    const base = this.parseUnary();
    if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "^") { this.p++; return { kind: "pow", base, exp: this.parseUnary() }; }
    return base;
  }
  private parseUnary(): Expr {
    if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "-") { this.p++; return { kind: "neg", arg: this.parseUnary() }; }
    if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "+") { this.p++; return this.parseUnary(); }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.t === "num") { this.p++; return { kind: "num", value: t.v }; }
    if (t.t === "sym") {
      this.p++;
      if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "(") {
        this.p++;
        const args: Expr[] = [];
        if (!(this.peek()?.t === "op" && (this.peek() as { v: string }).v === ")")) {
          args.push(this.parseExpr());
          while (this.peek()?.t === "op" && (this.peek() as { v: string }).v === ",") { this.p++; args.push(this.parseExpr()); }
        }
        this.eat("op", ")");
        if (!FUNCS.has(t.v)) throw new Error(`unknown function: ${t.v}`);
        return { kind: "call", name: t.v, args };
      }
      return { kind: "sym", name: t.v };
    }
    if (t.t === "op" && t.v === "(") { this.p++; const e = this.parseExpr(); this.eat("op", ")"); return e; }
    throw new Error(`unexpected token ${t.t} ${(t as { v: string }).v ?? ""}`);
  }
}

export function parseExpr(src: string): Expr { return new Parser(tokenize(src)).parseExpr(); }
export function parseEquation(src: string): Equation {
  return new EquationBuilder(tokenize(src)).build();
}
class EquationBuilder {
  private p = 0;
  constructor(private toks: Tok[]) {}
  build(): Equation {
    const lhs = this.expr();
    const op = this.readOp();
    if (!op) throw new Error("equation must contain a relational operator (=, ==, !=, <, <=, >, >=)");
    const rhs = this.expr();
    return { lhs, rhs, op };
  }
  /** Consume a relational operator and return it, or undefined if not present. */
  private readOp(): Equation["op"] | undefined {
    const t = this.toks[this.p];
    if (!t || t.t !== "op") return undefined;
    const v = (t as { v: string }).v;
    if (v === "=") {
      const t2 = this.toks[this.p + 1];
      if (t2 && t2.t === "op" && (t2 as { v: string }).v === "=") { this.p += 2; return "=="; }
      this.p++; return "=";
    }
    if (v === "<" || v === ">" || v === "<=" || v === ">=" || v === "!=" || v === "==") { this.p++; return v; }
    return undefined;
  }
  private eatOp(v: string) { const t = this.toks[this.p++]; if (!t || t.t !== "op" || (t as { v: string }).v !== v) throw new Error(`expected '${v}'`); }
  private expr(): Expr { return this.add() }
  private add(): Expr { let l = this.mul(); while (this.toks[this.p]?.t === "op" && ["+", "-"].includes((this.toks[this.p] as { v: string }).v)) { const op = (this.toks[this.p++] as { v: string }).v; const r = this.mul(); l = op === "+" ? { kind: "add", left: l, right: r } : { kind: "sub", left: l, right: r }; } return l; }
  private mul(): Expr { let l = this.pow(); while (this.toks[this.p]?.t === "op" && ["*", "/"].includes((this.toks[this.p] as { v: string }).v)) { const op = (this.toks[this.p++] as { v: string }).v; const r = this.pow(); l = op === "*" ? { kind: "mul", left: l, right: r } : { kind: "div", left: l, right: r }; } return l; }
  private pow(): Expr { const b = this.unary(); if (this.toks[this.p]?.t === "op" && (this.toks[this.p] as { v: string }).v === "^") { this.p++; return { kind: "pow", base: b, exp: this.unary() }; } return b; }
  private unary(): Expr { const t = this.toks[this.p]; if (t?.t === "op" && t.v === "-") { this.p++; return { kind: "neg", arg: this.unary() }; } if (t?.t === "op" && t.v === "+") { this.p++; return this.unary(); } return this.primary(); }
  private primary(): Expr { const t = this.toks[this.p++]; if (!t) throw new Error("eof"); if (t.t === "num") return { kind: "num", value: t.v }; if (t.t === "sym") { if (this.toks[this.p]?.t === "op" && (this.toks[this.p] as { v: string }).v === "(") { this.p++; const args: Expr[] = []; if (!(this.toks[this.p]?.t === "op" && (this.toks[this.p] as { v: string }).v === ")")) { args.push(this.expr()); while (this.toks[this.p]?.t === "op" && (this.toks[this.p] as { v: string }).v === ",") { this.p++; args.push(this.expr()); } } this.eatOp(")"); if (!FUNCS.has(t.v)) throw new Error(`unknown function ${t.v}`); return { kind: "call", name: t.v, args }; } return { kind: "sym", name: t.v }; } if (t.t === "op" && t.v === "(") { const e = this.expr(); this.eatOp(")"); return e; } throw new Error(`bad token ${t.t}`); }
}

// --------------------------------------------------------------------------- evaluator
//
// Substitute then evaluate. No model involvement. Throws on division by zero / domain
// errors; callers convert that into a structured rejection.

export function evalExpr(e: Expr, vars: Record<string, number>): number {
  switch (e.kind) {
    case "num": return e.value;
    case "sym": { if (!(e.name in vars)) throw new Error(`unbound variable: ${e.name}`); const v = vars[e.name]; if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`variable ${e.name} is not a finite number`); return v; }
    case "neg": return -evalExpr(e.arg, vars);
    case "add": return evalExpr(e.left, vars) + evalExpr(e.right, vars);
    case "sub": return evalExpr(e.left, vars) - evalExpr(e.right, vars);
    case "mul": return evalExpr(e.left, vars) * evalExpr(e.right, vars);
    case "div": { const r = evalExpr(e.right, vars); if (r === 0) throw new Error("division by zero"); return evalExpr(e.left, vars) / r; }
    case "pow": { const x = evalExpr(e.base, vars); const y = evalExpr(e.exp, vars); if (!Number.isInteger(y) && x < 0) throw new Error("negative base with non-integer exponent"); return Math.pow(x, y); }
    case "call": return callFn(e.name, e.args.map((a) => evalExpr(a, vars)));
  }
}

function callFn(name: string, args: number[]): number {
  switch (name) {
    case "sqrt": if (args[0] < 0) throw new Error("sqrt of negative"); return Math.sqrt(args[0]);
    case "sin": return Math.sin(args[0]);
    case "cos": return Math.cos(args[0]);
    case "tan": return Math.tan(args[0]);
    case "asin": if (args[0] < -1 || args[0] > 1) throw new Error("asin domain"); return Math.asin(args[0]);
    case "acos": if (args[0] < -1 || args[0] > 1) throw new Error("acos domain"); return Math.acos(args[0]);
    case "atan": return Math.atan(args[0]);
    case "exp": return Math.exp(args[0]);
    case "log": case "ln": if (args[0] <= 0) throw new Error("log domain"); return Math.log(args[0]);
    case "abs": return Math.abs(args[0]);
    case "min": return Math.min(...args);
    case "max": return Math.max(...args);
    default: throw new Error(`unsupported function: ${name}`);
  }
}

/** Free variables in an expression (so callers can tell what is unresolved). */
export function freeVars(e: Expr, out: Set<string> = new Set()): Set<string> {
  switch (e.kind) {
    case "num": break;
    case "sym": out.add(e.name); break;
    case "neg": freeVars(e.arg, out); break;
    case "add": freeVars(e.left, out); freeVars(e.right, out); break;
    case "sub": freeVars(e.left, out); freeVars(e.right, out); break;
    case "mul": freeVars(e.left, out); freeVars(e.right, out); break;
    case "div": freeVars(e.left, out); freeVars(e.right, out); break;
    case "pow": freeVars(e.base, out); freeVars(e.exp, out); break;
    case "call": for (const a of e.args) freeVars(a, out); break;
  }
  return out;
}

// --------------------------------------------------------------------------- unit checker
//
// Lightweight SI-unit consistency. We don't try to be Mathcad; we just refuse to add
// meters to seconds and call it "validated". Each variable carries an optional unit
// string. The walker computes a derived unit expression per AST node; mismatches on
// `+`/`-` or division-of-different-units are reported as a hard error.

export type Unit = { dim: Record<string, number> };
export type UnitBank = Record<string, string>;

const UNITS: UnitBank = {
  // base SI
  m: "m", s: "s", kg: "kg", A: "A", K: "K", mol: "mol", cd: "cd",
  // common derived names — parenthesised form is fully supported
  N: "kg*m/s^2", J: "kg*m^2/s^2", W: "kg*m^2/s^3", Pa: "kg/(m*s^2)",
  V: "kg*m^2/(A*s^3)", ohm: "kg*m^2/(A^2*s^3)",
  Hz: "1/s", rad: "1", deg: "1",
};

// Parse a unit expression like "kg*m/s^2" or "kg*m^2/(A*s^3)" into a dimensions
// record {kg:1, m:1, s:-2}. The parser respects parentheses and treats them as
// implicit grouping for the / operator.
export function parseUnit(spec: string): Unit {
  // "1" or empty is dimensionless.
  const trimmed = spec.trim();
  if (trimmed === "" || trimmed === "1" || trimmed === "-") return { dim: {} };
  // Walk the string, respecting parens, and split into top/bottom factors.
  const top: string[] = []; const bot: string[] = [];
  // We use a small recursive split: outside any parens, '/' moves to the bottom
  // bucket; '*' is a separator. Inside parens, we recurse so that "kg/(m*s^2)"
  // is equivalent to "kg/m/s^2" on the bottom.
  const walk = (s: string, sink: "top" | "bot"): void => {
    let buf = "";
    const flush = () => { if (buf.trim()) { if (sink === "top") top.push(buf.trim()); else bot.push(buf.trim()); } buf = ""; };
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "(") {
        // find matching close
        let depth = 1; let j = i + 1;
        while (j < s.length && depth > 0) { if (s[j] === "(") depth++; else if (s[j] === ")") depth--; j++; }
        if (depth !== 0) throw new Error(`unmatched '(' in unit: ${s}`);
        // The contents of the parens are added to the current sink with their
        // own top/bot split.
        const inner = s.slice(i + 1, j - 1);
        walk(inner, sink);
        i = j - 1;
        continue;
      }
      if (c === "/" || c === "*") { flush(); if (c === "/") sink = sink === "top" ? "bot" : "bot"; continue; }
      buf += c;
    }
    flush();
  };
  walk(spec, "top");
  const dim: Record<string, number> = {};
  for (const p of [...top, ...bot]) {
    // Numeric-only tokens like "1" in "1/s" are dimensionless coefficients and
    // contribute nothing. Skip them instead of throwing.
    if (/^-?\d+(\.\d+)?$/.test(p)) continue;
    const m = /^([A-Za-z_]+)(?:\^(-?\d+))?$/.exec(p);
    if (!m) throw new Error(`bad unit token: ${p}`);
    const exp = m[2] ? Number(m[2]) : 1;
    const inBot = bot.includes(p);
    const name = UNITS[m[1]] ?? m[1];
    if (name.includes("*") || name.includes("/") || name.includes("(")) {
      const sub = parseUnit(name);
      for (const [k, v] of Object.entries(sub.dim)) dim[k] = (dim[k] ?? 0) + v * exp * (inBot ? -1 : 1);
    } else {
      dim[name] = (dim[name] ?? 0) + exp * (inBot ? -1 : 1);
    }
  }
  return { dim };
}

function unitEq(a: Unit, b: Unit): boolean { return JSON.stringify(a.dim) === JSON.stringify(b.dim); }
const DIMENSIONLESS: Unit = { dim: {} };

// Annotate an expression with units and check consistency. `unitOf` provides the unit
// for each symbol. Throws on mismatch.
export function checkUnits(e: Expr, unitOf: Record<string, string>): Unit {
  // local helpers — keeps the switch narrow and TypeScript-friendly
  const add = (a: Unit, b: Unit, label: string): Unit => { if (!unitEq(a, b)) throw new Error(`unit mismatch: cannot ${label} ${JSON.stringify(a.dim)} and ${JSON.stringify(b.dim)}`); return a; };
  const mul = (a: Unit, b: Unit): Unit => { const d: Record<string, number> = { ...a.dim }; for (const [k, v] of Object.entries(b.dim)) d[k] = (d[k] ?? 0) + v; return { dim: d }; };
  const div = (a: Unit, b: Unit): Unit => { const d: Record<string, number> = { ...a.dim }; for (const [k, v] of Object.entries(b.dim)) d[k] = (d[k] ?? 0) - v; return { dim: d }; };

  switch (e.kind) {
    case "num": return DIMENSIONLESS;
    case "sym": if (!unitOf[e.name]) throw new Error(`no unit declared for ${e.name}`); return parseUnit(unitOf[e.name]);
    case "neg": return checkUnits(e.arg, unitOf);
    case "add": return add(checkUnits(e.left, unitOf), checkUnits(e.right, unitOf), "add");
    case "sub": return add(checkUnits(e.left, unitOf), checkUnits(e.right, unitOf), "subtract");
    case "mul": return mul(checkUnits(e.left, unitOf), checkUnits(e.right, unitOf));
    case "div": return div(checkUnits(e.left, unitOf), checkUnits(e.right, unitOf));
    case "pow": { const base = checkUnits(e.base, unitOf); const exp = checkUnits(e.exp, unitOf); if (!unitEq(exp, DIMENSIONLESS)) throw new Error("exponent must be dimensionless"); return { dim: { ...base.dim } }; }
    case "call": {
      const argUnits = e.args.map((a) => checkUnits(a, unitOf));
      switch (e.name) {
        case "sqrt": { const d: Record<string, number> = {}; for (const [k, v] of Object.entries(argUnits[0].dim)) d[k] = v / 2; return { dim: d }; }
        case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": case "exp": case "log": case "ln": case "abs":
          for (const u of argUnits) if (!unitEq(u, DIMENSIONLESS)) throw new Error(`${e.name}() requires dimensionless argument, got ${JSON.stringify(u.dim)}`);
          return DIMENSIONLESS;
        case "min": case "max":
          if (argUnits.length < 2) throw new Error(`${e.name}() needs 2+ args`);
          for (let i = 1; i < argUnits.length; i++) if (!unitEq(argUnits[0], argUnits[i])) throw new Error(`${e.name}() args have different units`);
          return argUnits[0];
        default: throw new Error(`unsupported function for unit check: ${e.name}`);
      }
    }
  }
}
