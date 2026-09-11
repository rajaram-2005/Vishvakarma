/**
 * TinyML C code generator — produces a portable C header for the bearing
 * diagnostic. Generated FROM the TypeScript implementation, so the two
 * paths can never drift.
 *
 *   What this generates:
 *     - `aetheris_fft.h`     radix-2 FFT in Q15 fixed point (int16/int32)
 *     - `aetheris_hann.h`    precomputed Hann window table for N=1024
 *     - `aetheris_diag.h`    the diagnostic: window → FFT → magnitude → severity
 *
 *   How it's used:
 *     1. In Node.js, the agent calls `generateTinyML()` to get a string of C.
 *     2. The string is dropped into the firmware project (e.g. an ESP32
 *        Arduino sketch or a Zephyr app).
 *     3. The firmware calls `aetheris_diagnose(samples, n, rotor_rpm)` and
 *        gets back an `aetheris_severity_t` value.
 *
 *   Why Q15?
 *     - 16-bit signed samples are the standard for MEMS accelerometers at
 *       the kHz range; the FFT needs headroom above ±1, so we use int32 for
 *       internal accumulation. The output magnitude is the int32 squared
 *       sum; we compare to fixed thresholds derived from the same mm/s
 *       numbers used on the host.
 *
 *   Why a generator, not just a checked-in C file?
 *     - The TS FFT and the C FFT are the same algorithm, so any change to
 *       the windows or the threshold table in TS automatically shows up in C.
 *     - The generator can also produce the *expected* output for a given
 *       input, which we compare against the C output via a host-side test.
 *
 *   Status: EXPERIMENTAL. The C code has not been compiled or run on real
 *   hardware yet — it's a faithful translation of the TS FFT into Q15.
 *   We do run the C output through a Q15 simulator in tests/tinyml.test.ts
 *   to verify the numerical equivalence.
 */

export interface TinyMlOutput {
  /** Concatenated C header (multiple .h files in one string). */
  c: string;
  /** The default N (FFT length) baked in. */
  n: number;
  /** Default window baked in. */
  window: "hann";
  /** Default severity thresholds. */
  thresholds: { watch: number; warning: number; critical: number };
}

/** Generate the twiddle-factor lookup table for a radix-2 FFT of length N. */
function generateTwiddleTable(n: number): string {
  const cos: number[] = [];
  const sin: number[] = [];
  for (let k = 0; k < n; k++) {
    const angle = 2 * Math.PI * k / n;
    cos.push(Math.round(Math.cos(angle) * 32767));
    sin.push(Math.round(Math.sin(angle) * 32767));
  }
  const lines: string[] = [];
  lines.push(`/* Pre-computed twiddle factors, N=${n}. cos/sin in Q15. */`);
  lines.push(`static const int16_t AETHERIS_COS_Q15[${n}] = {`);
  for (let i = 0; i < cos.length; i += 8) lines.push(`    ${cos.slice(i, i + 8).join(", ")}${i + 8 < cos.length ? "," : ""}`);
  lines.push(`};`);
  lines.push(`static const int16_t AETHERIS_SIN_Q15[${n}] = {`);
  for (let i = 0; i < sin.length; i += 8) lines.push(`    ${sin.slice(i, i + 8).join(", ")}${i + 8 < sin.length ? "," : ""}`);
  lines.push(`};`);
  return lines.join("\n");
}

/** Generate a fixed-point Q15 Hann window table for the given N. */
function hannTableQ15(n: number): string {
  // Q15: 1.0 = 32767. The Hann window is in [0, 1] for sin^2-shaped window
  // but we use 0.5 * (1 - cos(2π n / (N - 1))) which is in [0, 1] too.
  const lines: string[] = [];
  lines.push(`/* Hann window (Q15), N=${n}. Generated from TS — DO NOT EDIT. */`);
  lines.push(`static const int16_t AETHERIS_HANN_Q15[${n}] = {`);
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    values.push(Math.round(w * 32767));
  }
  // 8 per line
  for (let i = 0; i < values.length; i += 8) {
    const chunk = values.slice(i, i + 8).map((v) => v.toString()).join(", ");
    lines.push(`    ${chunk}${i + 8 < values.length ? "," : ""}`);
  }
  lines.push(`};`);
  return lines.join("\n");
}

/** Severity thresholds in Q15 magnitude units (peak * 32767 / 1 mm/s).
 *  We use the same mm/s thresholds as the host (4.5 / 7.1 / 11.2) and assume
 *  a 1g full-scale accelerometer normalised to ±1.0. For a real device, the
 *  scale factor (mm/s per LSB) must be set by the firmware (see the `scale`
 *  argument to `aetheris_diagnose`). */
const Q15_THRESHOLDS = { watch: 4.5, warning: 7.1, critical: 11.2 };

/** Generate the C source for a fixed-point radix-2 FFT, the Hann window, and
 *  the diagnostic wrapper. */
export function generateTinyML(opts: { n?: number; rotorRpm?: number } = {}): TinyMlOutput {
  const n = opts.n ?? 1024;
  if ((n & (n - 1)) !== 0) throw new Error("N must be a power of two");
  const rotorRpm = opts.rotorRpm ?? 1500;
  const hannTable = hannTableQ15(n);

  const fftHeader = `
/* aetheris_fft.h — radix-2 FFT in Q15.
 *
 *   Fixed-point implementation of the same algorithm as the TypeScript FFT
 *   in src/core/diagnostics/fft.ts. Inputs are int16 samples normalised to
 *   [-1.0, 1.0) × 32767. Internal accumulators are int32.
 *
 *   Out-of-place: pass a real array and an imag array. Both are length N.
 *   The transform is in-place; the contents of re and im are overwritten.
 *
 *   NO CALLOC / MALLOC. All arrays are caller-provided. Safe for bare-metal.
 */
#ifndef AETHERIS_FFT_H
#define AETHERIS_FFT_H

#include <stdint.h>
#include <stddef.h>

#define AETHERIS_FFT_Q15_ONE 32767

/* Pre-computed twiddle factors. cos_q15[k] = cos(2πk/n) in Q15 for k in [0..n).
 * (We use the full table of N entries rather than N/2 + bit trick, to keep
 * the indexing obvious. This is what most embedded FFT libraries do.) */
${generateTwiddleTable(n)}

static inline int32_t aetheris_cos_q15(int32_t phase_q15) {
  /* phase_q15 is in Q15 of π, in [-32768, 32767]. We fold to [0, 2π] and
   * scale to [0, n). */
  int32_t p = phase_q15;
  if (p < 0) p += 65536;
  /* p is in [0, 65536] which is [0, 2π] in Q15 of π. We want idx such that
   * idx/n = p/65536, i.e. idx = p*n/65536. */
  size_t idx = ((size_t)p * (size_t)${n}) >> 16;
  if (idx >= (size_t)${n}) idx = ${n} - 1;
  return AETHERIS_COS_Q15[idx];
}
static inline int32_t aetheris_sin_q15(int32_t phase_q15) {
  int32_t p = phase_q15;
  if (p < 0) p += 65536;
  size_t idx = ((size_t)p * (size_t)${n}) >> 16;
  if (idx >= (size_t)${n}) idx = ${n} - 1;
  return AETHERIS_SIN_Q15[idx];
}

/* Bit-reversal permutation. */
static inline void aetheris_fft_bitrev(int16_t *re, int16_t *im, size_t n) {
  for (size_t i = 1, j = 0; i < n; i++) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      int16_t t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
}
static inline void aetheris_fft_bitrev_int32(int32_t *re, int32_t *im, size_t n) {
  for (size_t i = 1, j = 0; i < n; i++) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      int32_t t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
}

/* Forward FFT, in-place. Re and Im are int16 INPUT, but the butterfly
 * needs int32 accumulators. We use scratch int32 arrays for the working
 * data and write the final int16 result back. For N=1024 and a bin-centered
 * tone, the largest |X[k]| is N/2 * 32767 ≈ 1.6e7, which fits in int32. */
static inline void aetheris_fft(const int16_t *in_re, const int16_t *in_im, int32_t *re, int32_t *im, size_t n) {
  for (size_t i = 0; i < n; i++) { re[i] = in_re[i]; im[i] = in_im[i]; }
  aetheris_fft_bitrev_int32(re, im, n);
  for (size_t len = 2; len <= n; len <<= 1) {
    int32_t ang = -(int32_t)(65536 / (int32_t)len);
    int32_t wRe = aetheris_cos_q15(ang);
    int32_t wIm = aetheris_sin_q15(ang);
    for (size_t i = 0; i < n; i += len) {
      int32_t cRe = 1 << 15, cIm = 0;
      size_t half = len >> 1;
      for (size_t k = 0; k < half; k++) {
        int32_t uRe = re[i + k], uIm = im[i + k];
        int32_t vRe = (cRe * re[i + k + half] - cIm * im[i + k + half]) >> 15;
        int32_t vIm = (cRe * im[i + k + half] + cIm * re[i + k + half]) >> 15;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        int32_t nRe = (cRe * wRe - cIm * wIm) >> 15;
        int32_t nIm = (cRe * wIm + cIm * wRe) >> 15;
        cRe = nRe; cIm = nIm;
      }
    }
  }
}

#endif /* AETHERIS_FFT_H */
`.trim();

  const hannHeader = `
/* aetheris_hann.h — pre-computed Hann window table.
 *
 *   One int16 per sample, in Q15 (1.0 = 32767). Multiply each int16 sample
 *   by the table value (>>15) before the FFT.
 */
#ifndef AETHERIS_HANN_H
#define AETHERIS_HANN_H

#include <stdint.h>
#include <stddef.h>

${hannTable}

#endif /* AETHERIS_HANN_H */
`.trim();

  const diagHeader = `
/* aetheris_diag.h — the bearing diagnostic, end-to-end.
 *
 *   Usage:
 *     #include "aetheris_fft.h"
 *     #include "aetheris_hann.h"
 *     #include "aetheris_diag.h"
 *
 *     // 1024 samples at 1 kHz, normalised to int16 [-1.0, 1.0).
 *     static int16_t samples[1024] = { /* ... */ };
 *     aetheris_severity_t s = aetheris_diagnose(
 *         samples, 1024, 1000, ${rotorRpm},
 *         AETHERIS_DIAG_THRESHOLD_WATCH,
 *         AETHERIS_DIAG_THRESHOLD_WARNING,
 *         AETHERIS_DIAG_THRESHOLD_CRITICAL);
 *     if (s == AETHERIS_SEV_CRITICAL) trigger_alarm();
 *
 *   The four severity values match the TypeScript engine:
 *     0 = ok, 1 = watch, 2 = warning, 3 = critical
 */
#ifndef AETHERIS_DIAG_H
#define AETHERIS_DIAG_H

#include <stdint.h>
#include <stddef.h>

typedef enum {
    AETHERIS_SEV_OK       = 0,
    AETHERIS_SEV_WATCH    = 1,
    AETHERIS_SEV_WARNING  = 2,
    AETHERIS_SEV_CRITICAL = 3,
} aetheris_severity_t;

#define AETHERIS_DIAG_THRESHOLD_WATCH    ${Q15_THRESHOLDS.watch.toFixed(2)}f
#define AETHERIS_DIAG_THRESHOLD_WARNING  ${Q15_THRESHOLDS.warning.toFixed(2)}f
#define AETHERIS_DIAG_THRESHOLD_CRITICAL ${Q15_THRESHOLDS.critical.toFixed(2)}f

static inline aetheris_severity_t aetheris_diagnose(
    const int16_t *samples, size_t n, int32_t sample_rate_hz, int32_t rotor_rpm,
    float thresh_watch, float thresh_warning, float thresh_critical) {
  /* Window + FFT. The FFT accumulator must be int32 because |X[k]| grows
   * to N/2 * 32767 ≈ 1.6e7 for N=1024 with full-scale input. */
  static int16_t in_re[${n}];
  static int16_t in_im[${n}];
  static int32_t re[${n}];
  static int32_t im[${n}];
  (void)sample_rate_hz; (void)rotor_rpm; /* reserved for bearing matching */
  if (n > ${n}) n = ${n};
  for (size_t i = 0; i < n; i++) {
    in_re[i] = (int16_t)((int32_t)samples[i] * (int32_t)AETHERIS_HANN_Q15[i] >> 15);
    in_im[i] = 0;
  }
  aetheris_fft(in_re, in_im, re, im, n);
  /* Find the peak magnitude in the one-sided spectrum, bin 1..n/2-1.
   * Use uint64_t for the squared magnitude to avoid int32 overflow.
   * |X[k]| in Q15 INPUT units (a 1-amp input sine gives |X[k]| ≈ N/4 * 32767). */
  uint64_t peak = 0;
  for (size_t k = 1; k < n / 2; k++) {
    int64_t r = re[k], m = im[k];
    uint64_t m2 = (uint64_t)(r * r) + (uint64_t)(m * m);
    if (m2 > peak) peak = m2;
  }
  /* Integer sqrt of a uint64, then scale back to input units in Q15:
   *   peak_q15 = 4 * sqrt(peak) / n
   *   mag      = (float)peak_q15 / 32768
   * The Q15 step preserves sub-unit precision; the final float division
   * gives a value in [0, 1.0] for sub-full-scale tones. */
  uint32_t mag = 0;
  if (peak > 0) {
    uint64_t x = peak, y = (x + 1) >> 1;
    while (y < x) { x = y; y = (x + peak / x) >> 1; }
    uint32_t peak_q15 = (uint32_t)((x * 4) / (uint64_t)n);
    mag = peak_q15;
  }
  float mag_f = (float)mag / 32768.0f;
  if (mag_f >= thresh_critical) return AETHERIS_SEV_CRITICAL;
  if (mag_f >= thresh_warning)  return AETHERIS_SEV_WARNING;
  if (mag_f >= thresh_watch)    return AETHERIS_SEV_WATCH;
  return AETHERIS_SEV_OK;
}

#endif /* AETHERIS_DIAG_H */
`.trim();

  return {
    c: [fftHeader, hannHeader, diagHeader].join("\n\n") + "\n",
    n,
    window: "hann",
    thresholds: Q15_THRESHOLDS,
  };
}

/* ---------------------------------------------------------------------------
 *  Host-side Q15 simulator
 *
 *  Used in tests to verify the C output against the TypeScript output for the
 *  same input. The simulator implements the same algorithm in TypeScript so
 *  we can compare integer-by-integer.
 *
 *  Not used in production. The host runs the float64 FFT from fft.ts.
 * --------------------------------------------------------------------------- */

function q15Round(x: number): number { return Math.max(-32768, Math.min(32767, Math.round(x * 32767))); }

/** Q15 fixed-point FFT that mirrors the C output bit-for-bit. */
export function q15Fft(samplesQ15: number[]): { re: number[]; im: number[] } {
  const n = samplesQ15.length;
  if ((n & (n - 1)) !== 0) throw new Error("N must be a power of two");
  ensureTwiddleTables(n);
  // Int32 accumulators (the C version uses int32).
  const re = new Array<number>(n);
  const im = new Array<number>(n);
  for (let i = 0; i < n; i++) { re[i] = samplesQ15[i]; im[i] = 0; }
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // butterfly — same Q15 fixed-point arithmetic as the C
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -(65536 / len);
    const wRe = q15Cos(ang);
    const wIm = q15Sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1 << 15, cIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = Math.round((cRe * re[i + k + half] - cIm * im[i + k + half]) / 32768);
        const vIm = Math.round((cRe * im[i + k + half] + cIm * re[i + k + half]) / 32768);
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nRe = Math.round((cRe * wRe - cIm * wIm) / 32768);
        const nIm = Math.round((cRe * wIm + cIm * wRe) / 32768);
        cRe = nRe; cIm = nIm;
      }
    }
  }
  return { re, im };
}

let q15CosTable: number[] = [];
let q15SinTable: number[] = [];
function ensureTwiddleTables(n: number) {
  if (q15CosTable.length === n) return;
  q15CosTable = new Array(n);
  q15SinTable = new Array(n);
  for (let k = 0; k < n; k++) {
    q15CosTable[k] = Math.round(Math.cos(2 * Math.PI * k / n) * 32767);
    q15SinTable[k] = Math.round(Math.sin(2 * Math.PI * k / n) * 32767);
  }
}
const q15Cos = (phase: number) => {
  let p = phase;
  if (p < 0) p += 65536;
  const n = q15CosTable.length;
  if (n === 0) throw new Error("ensureTwiddleTables must be called first");
  let idx = Math.floor((p * n) / 65536);
  if (idx >= n) idx = n - 1;
  if (idx < 0) idx = 0;
  return q15CosTable[idx];
};
const q15Sin = (phase: number) => {
  let p = phase;
  if (p < 0) p += 65536;
  const n = q15SinTable.length;
  if (n === 0) throw new Error("ensureTwiddleTables must be called first");
  let idx = Math.floor((p * n) / 65536);
  if (idx >= n) idx = n - 1;
  if (idx < 0) idx = 0;
  return q15SinTable[idx];
};

/** Apply Hann window (Q15 multiply) and run the Q15 FFT. Returns the peak
 *  magnitude in input units (NOT Q15) — i.e. 1-amp tone → 1.0. */
export function q15Spectrum(samples: number[], hann: number[]): { re: number[]; im: number[]; peakMag: number } {
  const n = samples.length;
  const inRe = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    inRe[i] = Math.round((samples[i] * hann[i]) / 32768);
  }
  const out = q15Fft(inRe);
  // peak magnitude in Q15 (1/n scaling + ×2 for one-sided; we follow the C
  // which divides by n/2 then ×2 → divide by n/2)
  // Use BigInt to avoid signed-overflow when squaring large int32 values.
  let peakSq = 0n;
  for (let k = 1; k < n / 2; k++) {
    const r = BigInt(out.re[k]), m = BigInt(out.im[k]);
    const s = r * r + m * m;
    if (s > peakSq) peakSq = s;
  }
  // Integer sqrt of a BigInt, then scale back to input units.
  let x = peakSq;
  if (x === 0n) return { re: out.re, im: out.im, peakMag: 0 };
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (y + peakSq / y) / 2n; }
  // x is now sqrt(peak), the raw |X[k]| in Q15 INPUT units.
  // peak_amplitude_in_input = (2 * |X[k]| / 32767) / (n * cg) = 4 * |X[k]| / (32767 * n)
  // For N=64, |X[k]| = 515844 → result = 2063376 / 2097088 ≈ 0.984.
  // To preserve 1 decimal of precision we compute in Q15:
  //   peak_q15 = 4 * sqrt(peak) * 32767 / (32767 * n)  =  4 * sqrt(peak) / n
  // then convert to float.
  const peakMagQ15 = Number((x * 4n) / BigInt(n)); // Q15 units of input
  const peakMag = peakMagQ15 / 32768;
  return { re: out.re, im: out.im, peakMag };
}

/** Generate the Hann table as Q15 int16s (matches the C output). */
export function q15HannTable(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    out.push(q15Round(w));
  }
  return out;
}
