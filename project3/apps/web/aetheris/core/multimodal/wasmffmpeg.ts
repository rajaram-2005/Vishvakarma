/**
 * ffmpeg as WebAssembly — frame sampling with no host binary.
 *
 * The `@ffmpeg/core` build is ffmpeg 5.1.4 compiled with Emscripten. It ships entirely inside an npm
 * tarball, so it installs from the registry without downloading a binary from anywhere — which is the
 * one thing that makes frame sampling work on hosts where no package mirror or release host is
 * reachable. Three things are required to drive it from Node rather than a browser tab:
 *
 *   1. `globalThis.self` and `globalThis.location.href` must exist — Emscripten's glue reads
 *      `self.location.href` to work out `scriptDirectory` and throws without it.
 *   2. `wasmBinary` must be handed to the module from `fs`. Otherwise the glue `fetch()`es the
 *      .wasm over HTTP, which fails offline even though the file is sitting on disk.
 *   3. One worker per invocation. A real transcode ends with ffmpeg calling `exit()`, which tears the
 *      Emscripten runtime down and leaves every later `exec()` in the same isolate throwing
 *      `Aborted()`. Loading fresh per call costs ~1s and keeps the runtime honest.
 *
 * Everything runs in a `worker_thread`, so a slow decode never blocks the server's event loop, and
 * every job is killed at `timeoutMs`. Bytes in, bytes out: nothing touches the real filesystem.
 *
 * The dependency is optional. `wasmFfmpegAvailable()` reports false when the core is not installed,
 * and every caller falls back to the next video path rather than failing.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

export interface WasmSampleOptions {
  /** Sample one frame every N seconds (default 5). */
  everySeconds?: number;
  /** Hard cap on frames returned (default 6). */
  maxFrames?: number;
  /** Scale width in pixels; -1 keeps the source width (default 768). */
  width?: number;
  /** Kill the job after this long (default 120s). */
  timeoutMs?: number;
  /** Largest input we will load into the worker (default 256 MB). */
  maxInputBytes?: number;
}

export interface WasmSampleResult {
  ok: boolean;
  /** JPEG frames, in time order. */
  frames: Buffer[];
  /** Wall-clock second each frame was taken at. */
  atSeconds: number[];
  /** ffmpeg's own exit code, when it reported one. */
  rc?: number;
  /** ffmpeg version, e.g. "5.1.4". */
  version?: string;
  reason?: string;
}

/**
 * The worker body, as plain JavaScript. It has to stay syntax-free of TypeScript because it is
 * compiled as a string at runtime, not by the project's own compiler.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// (1) Emscripten's environment probe. Without these the glue dies reading self.location.href.
globalThis.self = globalThis;
globalThis.location = { href: pathToFileURL(path.join(workerData.dir, "ffmpeg-core.js")).href };

const logs = [];
let settled = false;
const finish = (payload) => { if (!settled) { settled = true; parentPort.postMessage(payload); } };

try {
  require(path.join(workerData.dir, "ffmpeg-core.js"))({
    locateFile: (f) => path.join(workerData.dir, f),
    // (2) Hand it the bytes; never let it fetch.
    wasmBinary: workerData.wasm,
    print: (t) => logs.push(t),
    printErr: (t) => logs.push(t),
    noInitialRun: true,
  }).then((M) => {
    try {
      M.setLogger(({ message }) => logs.push(message));

      M.FS.writeFile(workerData.inputName, workerData.input);
      M.FS.mkdir("/out");

      let rc = -1;
      try {
        rc = M.exec(...workerData.args);
      } catch (e) {
        // (3) ffmpeg calls exit() when it finishes, which surfaces as Aborted. That is success,
        //     not a crash — the real status is in M.ret.
        if (!String((e && e.message) || e).startsWith("Aborted")) throw e;
        rc = typeof M.ret === "number" ? M.ret : 0;
      }

      const names = M.FS.readdir("/out").filter((n) => /\\.jpg$/.test(n)).sort();
      const frames = names.map((n) => Buffer.from(M.FS.readFile("/out/" + n)));
      // Read the version only after exec: the banner is printed by the run itself, so the log is
      // empty until ffmpeg has actually been invoked.
      const version = (logs.join(" ").match(/ffmpeg version ([\\d.]+)/) || [])[1];
      finish({ ok: rc === 0 && frames.length > 0, rc, version, frames, log: logs.join(" ").slice(-400) });
    } catch (e) {
      finish({ ok: false, rc: -1, frames: [], log: String((e && e.message) || e).slice(0, 400) });
    }
  }).catch((e) => finish({ ok: false, rc: -1, frames: [], log: String((e && e.message) || e).slice(0, 400) }));
} catch (e) {
  finish({ ok: false, rc: -1, frames: [], log: String((e && e.message) || e).slice(0, 400) });
}
`;

interface CorePaths {
  dir: string;
  wasm: Buffer;
  version: string | null;
}

let cached: CorePaths | null | undefined;
let cachedReason: string | undefined;

/**
 * The installed core package, and the directories the lookup starts from.
 *
 * Resolution is deliberately **filesystem-only**: nothing in this module calls `require()`,
 * `import()` or `require.resolve()` with a computed specifier. That is not a stylistic choice — it is
 * what keeps the module bundler-independent:
 *
 *   - A computed `require.resolve(expr)` makes webpack emit
 *     `Critical dependency: the request of a dependency is an expression` for this file, because the
 *     request cannot be resolved at build time. Two such calls used to produce two build warnings on
 *     every `next build`.
 *   - Worse, webpack *replaces* `createRequire` with a shim that only resolves specifiers it could see
 *     at build time. Inside a compiled Next server chunk the "plain Node resolution" branch therefore
 *     reported the package missing even when it was installed — so the branch that was supposed to be
 *     the fast, correct path was the unreliable one, and every bundled call fell through to the
 *     filesystem walk anyway.
 *
 * Walking `node_modules` with `fs` and reading the package's own manifest asks the filesystem, which
 * gives the same true answer under `tsx`, under `node`, inside a Next server chunk and inside the
 * desktop app's standalone bundle. One code path, one behaviour, no bundler warnings.
 *
 * The 62 MB `@ffmpeg/core` tarball is still never bundled: `next.config.ts` pins it into the
 * standalone output with `outputFileTracingIncludes`, and this module reads it from disk at runtime.
 */
const CORE_PACKAGE = "@ffmpeg/core";
const CORE_PATH_PARTS = CORE_PACKAGE.split("/");

/**
 * Walk up from the module's own directory and from the process cwd looking for the installed core
 * package. Returns the package directory, or null when it is genuinely not installed anywhere above
 * either root.
 */
function findCoreDir(): string | null {
  for (const start of resolutionRoots()) {
    let dir = path.resolve(start);
    for (let i = 0; i < 16; i++) {
      const cand = path.join(dir, "node_modules", ...CORE_PATH_PARTS);
      if (existsSync(path.join(cand, "package.json"))) return cand;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Resolve the glue and wasm paths from the package's own manifest, not from a hard-coded layout. */
function pathsFromManifest(pkgDir: string): { glue: string; wasm: string } {
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
    main?: string;
    exports?: Record<string, { require?: string; import?: string } | string>;
  };
  const pick = (e: { require?: string; import?: string } | string | undefined) =>
    (typeof e === "string" ? e : e?.require ?? e?.import) ?? null;
  const glueRel = pick(pkg.exports?.["."]) ?? pkg.main ?? "./dist/umd/ffmpeg-core.js";
  const glue = path.resolve(pkgDir, glueRel);
  // The wasm sits beside the glue under the same name; prefer the manifest's ./wasm export.
  const wasmRel = pick(pkg.exports?.["./wasm"]);
  const wasm = wasmRel ? path.resolve(pkgDir, wasmRel) : glue.replace(/\.js$/, ".wasm");
  return { glue, wasm };
}

/** Locate the installed core. `undefined` while unresolved, `null` once known-absent. */
function core(): CorePaths | null {
  if (cached !== undefined) return cached;
  try {
    const pkgDir = findCoreDir();
    if (!pkgDir) throw new Error(`no node_modules/${CORE_PACKAGE} found from ${[...resolutionRoots()].join(" or ")}`);
    const { glue, wasm: wasmPath } = pathsFromManifest(pkgDir);
    if (!existsSync(glue)) throw new Error(`${CORE_PACKAGE} manifest points at a missing entry: ${glue}`);
    if (!existsSync(wasmPath)) throw new Error(`${CORE_PACKAGE} is installed without its wasm binary: ${wasmPath}`);
    cached = { dir: path.dirname(glue), wasm: readFileSync(wasmPath), version: null };
    cachedReason = undefined;
    return cached;
  } catch (e) {
    cached = null;
    // Keep the reason: "not available" on its own is not actionable, and a half-installed package
    // (or one the bundler failed to trace into a standalone output) looks identical to a missing one
    // unless the underlying error is shown.
    cachedReason = `${(e as Error)?.name ?? "Error"}: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
    return null;
  }
}

/** The directories the node_modules walk starts from: this module's own, then the process cwd. */
function resolutionRoots(): Set<string> {
  const s = new Set<string>();
  if (typeof __dirname === "string") s.add(__dirname);
  s.add(process.cwd());
  return s;
}

/** Why the core is unavailable, when it is. Undefined once it resolves. */
export function wasmFfmpegReason(): string | undefined {
  core();
  return cachedReason;
}

/** True when the WASM core is installed and frame sampling can run on this host. */
export function wasmFfmpegAvailable(): boolean {
  return core() !== null;
}

interface WorkerReply {
  ok: boolean;
  rc: number;
  version?: string;
  frames: Buffer[];
  log: string;
}

/** Run one ffmpeg invocation in a throwaway worker. Bytes in, bytes out. */
function execOnce(args: string[], input: Buffer, inputName: string, timeoutMs: number): Promise<WorkerReply> {
  const c = core();
  if (!c) return Promise.resolve({ ok: false, rc: -1, frames: [], log: "@ffmpeg/core is not installed" });
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { dir: c.dir, wasm: c.wasm, args, input, inputName },
      });
    } catch (e) {
      resolve({ ok: false, rc: -1, frames: [], log: `worker failed to start: ${String((e as Error)?.message ?? e)}` });
      return;
    }
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ ok: false, rc: -1, frames: [], log: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    worker.once("message", (m: WorkerReply) => {
      clearTimeout(timer);
      void worker.terminate();
      // Structured clone drops the Buffer subclass, so re-wrap: callers rely on Buffer methods.
      resolve({ ...m, frames: (m.frames ?? []).map((f) => Buffer.from(f)) });
    });
    worker.once("error", (e: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, rc: -1, frames: [], log: `worker error: ${e.message}` });
    });
    worker.once("exit", () => {
      clearTimeout(timer);
      // Only reached if the worker died without posting; the timer path already resolved otherwise.
      resolve({ ok: false, rc: -1, frames: [], log: "worker exited before reporting" });
    });
  });
}

let versionCache: string | null | undefined;

/** ffmpeg's reported version, or null when unavailable. Costs one worker start. */
export async function wasmFfmpegVersion(): Promise<string | null> {
  if (versionCache !== undefined) return versionCache;
  if (!core()) return (versionCache = null);
  // -version is cheap and does not need an input file.
  const r = await execOnce(["-hide_banner", "-version"], Buffer.alloc(0), "/in.bin", 60_000);
  versionCache = r.version ?? null;
  return versionCache;
}

/**
 * Sample JPEG frames from a video held in memory.
 *
 * Uses `fps=1/N` so the sample rate is driven by the file's own timeline, and returns the second each
 * frame came from. A file shorter than one interval still yields its first frame, which is the useful
 * behaviour for clips.
 */
export async function sampleFramesWithWasm(input: Buffer, name: string, opts: WasmSampleOptions = {}): Promise<WasmSampleResult> {
  const every = Math.max(1, opts.everySeconds ?? 5);
  const maxFrames = Math.max(1, opts.maxFrames ?? 6);
  const width = opts.width && opts.width > 0 ? opts.width : 768;
  const maxInput = opts.maxInputBytes ?? 256 * 1024 * 1024;

  if (!core()) return { ok: false, frames: [], atSeconds: [], reason: "@ffmpeg/core is not installed — run npm install to enable WASM frame sampling" };
  if (!input || input.length === 0) return { ok: false, frames: [], atSeconds: [], reason: "empty video input" };
  if (input.length > maxInput) {
    const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${n} B`);
    return { ok: false, frames: [], atSeconds: [], reason: `input is ${mb(input.length)}, over the ${mb(maxInput)} limit for in-memory sampling` };
  }

  const ext = path.extname(name || "").toLowerCase() || ".mp4";
  const inputName = `/in${ext}`;
  const r = await execOnce(
    [
      "-hide_banner", "-loglevel", "error",
      "-i", inputName,
      "-vf", `fps=1/${every},scale=${width}:-1`,
      "-frames:v", String(maxFrames),
      "-q:v", "4",
      "/out/f%03d.jpg",
    ],
    input,
    inputName,
    opts.timeoutMs ?? 120_000,
  );

  if (!r.ok) {
    return { ok: false, frames: [], atSeconds: [], rc: r.rc, version: r.version, reason: r.log || "ffmpeg reported no frames" };
  }
  return {
    ok: true,
    frames: r.frames,
    atSeconds: r.frames.map((_, i) => i * every),
    rc: r.rc,
    // Frame runs use -loglevel error, so no banner is printed; reuse the cached version if known.
    version: r.version ?? versionCache ?? undefined,
  };
}
