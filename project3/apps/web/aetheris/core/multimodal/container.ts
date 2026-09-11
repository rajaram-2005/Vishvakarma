/**
 * ISO base-media-file (MP4/MOV/M4V/3GP) container reader — pure JS, no binary, no ffmpeg.
 *
 * Why this exists: `perceive({modality:"video"})` used to answer "NOT AVAILABLE" on any host without
 * ffmpeg, even though a video file carries real, machine-readable facts (duration, resolution, codec,
 * rotation, creation time, track layout, embedded cover art). Reading them is a byte-level walk of
 * the box tree — no decoder required. Frame *sampling* still needs ffmpeg or a video-native model;
 * this gives the caller the facts either way, and it is exercised offline by tests/multimodal.test.ts
 * against a hand-built box tree.
 *
 * It is a reader, not a validator: unknown boxes are skipped, truncated files return what was found,
 * and anything unparseable returns ok:false with a reason rather than throwing.
 */

export interface VideoTrack {
  kind: "video" | "audio" | "other";
  codec: string;
  /** Track handler (`vide`/`soun`/…), as declared by the file. */
  handler?: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  durationMs?: number;
}

export interface ContainerInfo {
  ok: boolean;
  /** Major brand from `ftyp`, e.g. `isom`, `mp42`, `qt  `. */
  brand?: string;
  durationMs?: number;
  timescale?: number;
  createdAt?: number;
  modifiedAt?: number;
  tracks: VideoTrack[];
  /** Display rotation in degrees, when a track transform matrix says so. */
  rotation?: number;
  /** Poster/cover image stored in the file (iTunes `covr`, or a `meta/ilst` cover). */
  coverArt?: { mime: string; bytes: number };
  /** Chapters, when a text track declares them. */
  chapters?: string[];
  reason?: string;
}

const readU32 = (b: Buffer, o: number) => b.readUInt32BE(o);
const readU16 = (b: Buffer, o: number) => b.readUInt16BE(o);
const tag = (b: Buffer, o: number) => b.subarray(o, o + 4).toString("latin1");

/** ISO BMFF stores seconds since 1904-01-01; JS epochs from 1970. */
const EPOCH_OFFSET_S = 2_082_844_800;
const macTime = (secs: number) => (secs > EPOCH_OFFSET_S ? (secs - EPOCH_OFFSET_S) * 1000 : undefined);

/** Rotation implied by a 3x3 transform matrix stored as 9 fixed-point entries (2.30 / 16.16). */
export function matrixRotation(m: number[]): number | undefined {
  if (!m || m.length < 9) return undefined;
  // a, b, u, c, d, v, x, y, w — the display matrix is [a b u; c d v; x y w] scaled by 2^16 (u,v by 2^30)
  const a = m[0] / 65536;
  const b = m[1] / 65536;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  const norm = ((deg % 360) + 360) % 360;
  return norm === 0 ? undefined : norm;
}

interface Box { type: string; start: number; end: number; body: number }

/** Iterate the boxes of a region. Yields nothing past a truncated file instead of throwing. */
function* boxes(buf: Buffer, from: number, to: number): Generator<Box> {
  let o = from;
  while (o + 8 <= to) {
    let size = readU32(buf, o);
    const type = tag(buf, o + 4);
    let body = o + 8;
    if (size === 1) {
      // 64-bit largesize
      if (o + 16 > to) return;
      const hi = buf.readUInt32BE(o + 8);
      const lo = buf.readUInt32BE(o + 12);
      size = hi * 2 ** 32 + lo;
      body = o + 16;
    } else if (size === 0) {
      size = to - o; // box runs to the end of the parent
    }
    if (size < 8) return; // corrupt
    const end = Math.min(o + size, to);
    yield { type, start: o, end, body };
    if (end <= o) return;
    o = end;
  }
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "meta", "ilst", "edts", "dinf"]);

function walk(buf: Buffer, from: number, to: number, type: string, out: Box[] = [], depth = 0): Box[] {
  if (depth > 8) return out;
  for (const b of boxes(buf, from, to)) {
    if (b.type === type) out.push(b);
    // `meta` carries a 4-byte version/flags prefix before its children
    if (CONTAINERS.has(b.type)) walk(buf, b.type === "meta" ? b.body + 4 : b.body, b.end, type, out, depth + 1);
  }
  return out;
}

/** First box of `type` at or below this level (the metadata we want is always nested). */
function find(buf: Buffer, from: number, to: number, type: string): Box | undefined {
  return walk(buf, from, to, type)[0];
}


/** Read a video file's container facts. Never throws. */
export function readContainer(data: Buffer): ContainerInfo {
  try {
    if (!data || data.length < 16) return { ok: false, tracks: [], reason: "not enough bytes to be a media file" };
    const info: ContainerInfo = { ok: true, tracks: [] };
    const ftyp = find(data, 0, data.length, "ftyp");
    if (ftyp && ftyp.end - ftyp.body >= 4) info.brand = tag(data, ftyp.body).trim();

    const mvhd = find(data, 0, data.length, "mvhd");
    if (mvhd) {
      const version = data[mvhd.body];
      if (version === 1 && mvhd.end - mvhd.body >= 28) {
        const created = Number(data.readBigUInt64BE(mvhd.body + 4));
        const modified = Number(data.readBigUInt64BE(mvhd.body + 12));
        const timescale = readU32(data, mvhd.body + 20);
        const duration = Number(data.readBigUInt64BE(mvhd.body + 24));
        info.timescale = timescale || undefined;
        if (timescale) info.durationMs = Math.round((duration / timescale) * 1000);
        info.createdAt = macTime(created);
        info.modifiedAt = macTime(modified);
      } else if (mvhd.end - mvhd.body >= 20) {
        const created = readU32(data, mvhd.body + 4);
        const modified = readU32(data, mvhd.body + 8);
        const timescale = readU32(data, mvhd.body + 12);
        const duration = readU32(data, mvhd.body + 16);
        info.timescale = timescale || undefined;
        if (timescale) info.durationMs = Math.round((duration / timescale) * 1000);
        info.createdAt = macTime(created);
        info.modifiedAt = macTime(modified);
      }
    }

    for (const trak of walk(data, 0, data.length, "trak")) {
      const track: VideoTrack = { kind: "other", codec: "unknown" };
      const tkhd = find(data, trak.body, trak.end, "tkhd");
      if (tkhd) {
        const v1 = data[tkhd.body] === 1;
        // tkhd: version+flags, creation, modification, track_ID, reserved, duration, reserved(8),
        // layer(2)+alternate_group(2)+volume(2)+reserved(2), then the 36-byte display matrix.
        const matrixAt = tkhd.body + (v1 ? 4 + 8 + 8 + 4 + 4 + 8 + 8 + 8 : 4 + 4 + 4 + 4 + 4 + 4 + 8 + 8);
        if (matrixAt + 36 <= tkhd.end) {
          const m = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => data.readInt32BE(matrixAt + i * 4));
          const rot = matrixRotation(m);
          if (rot) info.rotation = rot;
        }
        // width/height live at the end of tkhd as 16.16 fixed point
        if (tkhd.end - 8 >= matrixAt) {
          const w = readU32(data, tkhd.end - 8) / 65536;
          const h = readU32(data, tkhd.end - 4) / 65536;
          if (w > 0 && h > 0) { track.width = Math.round(w); track.height = Math.round(h); }
        }
      }
      const hdlr = find(data, trak.body, trak.end, "hdlr");
      if (hdlr && hdlr.end - hdlr.body >= 12) {
        const handler = tag(data, hdlr.body + 8);
        track.handler = handler;
        track.kind = handler === "vide" ? "video" : handler === "soun" ? "audio" : "other";
      }
      const mdhd = find(data, trak.body, trak.end, "mdhd");
      if (mdhd) {
        const v1 = data[mdhd.body] === 1;
        if (v1 && mdhd.end - mdhd.body >= 28) {
          const ts = readU32(data, mdhd.body + 20);
          const dur = Number(data.readBigUInt64BE(mdhd.body + 24));
          if (ts) track.durationMs = Math.round((dur / ts) * 1000);
        } else if (mdhd.end - mdhd.body >= 20) {
          const ts = readU32(data, mdhd.body + 12);
          const dur = readU32(data, mdhd.body + 16);
          if (ts) track.durationMs = Math.round((dur / ts) * 1000);
        }
      }
      // stsd: first entry's fourcc is the codec; sample entry carries geometry for video/audio
      const stsd = find(data, trak.body, trak.end, "stsd");
      if (stsd && stsd.end - stsd.body >= 16) {
        const entryAt = stsd.body + 8;
        track.codec = tag(data, entryAt + 4).trim() || "unknown";
        const entryEnd = Math.min(entryAt + readU32(data, entryAt), stsd.end);
        if (track.kind === "video" && entryEnd - entryAt >= 36) {
          const w = readU16(data, entryAt + 32);
          const h = readU16(data, entryAt + 34);
          if (w && h) { track.width = w; track.height = h; }
        } else if (track.kind === "audio" && entryEnd - entryAt >= 36) {
          // AudioSampleEntry: 16-byte header, then version(2) revision(2) vendor(4), channelcount(2),
          // samplesize(2), pre_defined(2), reserved(2), samplerate(4, 16.16 fixed point).
          track.channels = readU16(data, entryAt + 24);
          track.sampleRate = readU32(data, entryAt + 32) >>> 16;
        }
      }
      info.tracks.push(track);
    }

    // iTunes-style cover art: moov/udta/meta/ilst/covr/data
    for (const covr of walk(data, 0, data.length, "covr")) {
      const d = find(data, covr.body, covr.end, "data");
      // `data` box: version(1)+flags(3) — the flags carry the type indicator (13=jpeg, 14=png) —
      // then a 4-byte locale, then the payload.
      if (d && d.end - d.body > 8) {
        const typeFlag = readU32(data, d.body) & 0x00ffffff;
        const bytes = d.end - (d.body + 8);
        if (bytes > 0) {
          info.coverArt = { mime: typeFlag === 13 ? "image/jpeg" : typeFlag === 14 ? "image/png" : "image/jpeg", bytes };
          break;
        }
      }
    }

    if (!info.durationMs && !info.tracks.length) {
      return { ...info, ok: false, reason: `no moov box — ${info.brand ? `${info.brand} container, but` : "not an ISO media file, or"} metadata is not present (streamed/fast-start files put it at the end)` };
    }
    return info;
  } catch (e) {
    return { ok: false, tracks: [], reason: `container read failed: ${(e as Error).message}` };
  }
}

/** Compact human summary — what a caller shows when no frames could be sampled. */
export function describeContainer(info: ContainerInfo): string {
  if (!info.ok && !info.tracks.length) return `could not read the video container (${info.reason})`;
  const v = info.tracks.find((t) => t.kind === "video");
  const a = info.tracks.find((t) => t.kind === "audio");
  const bits = [
    info.brand ? `container ${info.brand}` : null,
    info.durationMs ? `duration ${(info.durationMs / 1000).toFixed(2)}s` : null,
    v ? `video ${v.codec}${v.width && v.height ? ` ${v.width}×${v.height}` : ""}` : null,
    a ? `audio ${a.codec}${a.sampleRate ? ` ${a.sampleRate}Hz/${a.channels ?? "?"}ch` : ""}` : null,
    info.rotation ? `rotated ${info.rotation}°` : null,
    info.createdAt ? `created ${new Date(info.createdAt).toISOString()}` : null,
    info.coverArt ? `embedded cover art (${info.coverArt.mime}, ${info.coverArt.bytes} bytes)` : null,
    `${info.tracks.length} track(s)`,
  ].filter(Boolean);
  return bits.join(" · ");
}
