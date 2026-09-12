// Aetherion Fabricate + Aetheris bridge — pure-module tests.
// PPTX zip structure, OBJ/GLTF export shape, deterministic geometry,
// deck outlines and the Aetheris SSE parser/reducer.

import { describe, expect, it } from 'vitest';
import { buildPptx, slidesHtml } from '../apps/web/lib/fabricate/pptx';
import { meshToObj, meshToGltf } from '../apps/web/lib/fabricate/exporters';
import { hashSeed, meshFromPrompt, meshLabel, rngFrom } from '../apps/web/lib/fabricate/geometry';
import { localOutline, aiOutline } from '../apps/web/lib/fabricate/deck';
import { parseSse, reduceSse } from '../apps/web/lib/aetheris';

const DECK = [
  { title: 'Overview', bullets: ['One', 'Two'] },
  { title: 'Next steps', bullets: ['Ship <it> & win', 'Measure'] },
];

describe('pptx export', () => {
  it('produces a zip with a valid EOCD and all parts', () => {
    const zip = buildPptx(DECK);
    expect(zip.length).toBeGreaterThan(500);
    // local file header signatures (PK\x03\x04)
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // EOCD (PK\x05\x06) must be in the tail
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    expect(eocd).toBeGreaterThan(0);
    // EOCD entry count matches the file set (9 core + 2×N slides)
    expect(dv.getUint16(eocd + 10, true)).toBe(9 + DECK.length * 2);
    // names are UTF-8 and content types present
    const text = new TextDecoder('utf-8').decode(zip);
    expect(text).toContain('ppt/slides/slide1.xml');
    expect(text).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
    expect(text).toContain('Ship &lt;it&gt;');
  });

  it('builds a standalone HTML deck with escaping', () => {
    const html = slidesHtml('My Deck', DECK);
    expect(html).toContain('<title>My Deck</title>');
    expect(html).toContain('Ship &lt;it&gt;');
    expect(html).not.toContain('Ship <it>');
  });
});

describe('mesh exporters', () => {
  it('exports OBJ with consistent counts', () => {
    const mesh = meshFromPrompt('a twisted glass tower');
    const obj = meshToObj(mesh, 'tower');
    const v = obj.split('\n').filter((l) => l.startsWith('v '));
    const f = obj.split('\n').filter((l) => l.startsWith('f '));
    expect(v.length).toBe(mesh.positions.length / 3);
    expect(f.length).toBe(mesh.indices.length / 3);
  });

  it('exports GLTF 2.0 with embedded buffer', () => {
    const mesh = meshFromPrompt('a big gear');
    const gltf = JSON.parse(meshToGltf(mesh, 'gear'));
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.meshes[0].primitives[0].attributes.POSITION).toBe(0);
    expect(gltf.buffers[0].uri.startsWith('data:application/octet-stream;base64,')).toBe(true);
    expect(gltf.accessors[0].count).toBe(mesh.positions.length / 3);
    expect(gltf.accessors[1].count).toBe(mesh.indices.length);
  });
});

describe('procedural geometry', () => {
  it('is deterministic per prompt', () => {
    const a = meshFromPrompt('a spiral skyscraper');
    const b = meshFromPrompt('a spiral skyscraper');
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it('selects the right family from keywords', () => {
    expect(meshLabel('a bronze gear')).toBe('gear');
    expect(meshLabel('a rolling ring torus')).toBe('ring');
    expect(meshLabel('a mountain terrain')).toBe('terrain');
    expect(meshLabel('a glass vase')).toBe('vase');
    expect(meshLabel('a twisted tornado tower')).toBe('twisted tower');
    expect(meshLabel('a rocket to the moon')).toBe('rocket');
  });

  it('hash + rng are stable', () => {
    expect(hashSeed('sutra')).toBe(hashSeed('sutra'));
    expect(hashSeed('sutra')).not.toBe(hashSeed('Aetherion'));
    const r1 = rngFrom(42);
    const r2 = rngFrom(42);
    expect(r1()).toBe(r2());
  });
});

describe('deck outlines', () => {
  it('local outline is deterministic and structured', () => {
    const a = localOutline('Project 3 — Aetherion');
    const b = localOutline('Project 3 — Aetherion');
    expect(a).toEqual(b);
    expect(a.slides.length).toBeGreaterThanOrEqual(6);
    for (const s of a.slides) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.bullets.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('aiOutline falls back to local on garbage', async () => {
    const r = await aiOutline('Topic X', async () => ({ content: 'not json at all' }));
    expect(r.via).toBe('local');
    expect(r.slides.length).toBeGreaterThanOrEqual(6);
  });

  it('aiOutline accepts strict JSON', async () => {
    const r = await aiOutline('Topic X', async () => ({
      content: '{"title":"T","slides":[{"title":"A","bullets":["b1","b2"]},{"title":"B","bullets":["b3"]}]}',
    }));
    expect(r.via).toBe('puter');
    expect(r.slides).toHaveLength(2);
  });
});

describe('aetheris SSE', () => {
  it('parses frames and reduces a delta stream', () => {
    const stream = [
      'event: delta\ndata: {"type":"delta","text":"Hel"}\n\n',
      'event: delta\ndata: {"type":"delta","text":"lo"}\n\n',
      'event: done\ndata: {"type":"done","provider":"openai","model":"gpt-test","offline":false}\n\n',
    ].join('');
    const frames = parseSse(stream);
    expect(frames).toHaveLength(3);
    const out = reduceSse(frames);
    expect(out.content).toBe('Hello');
    expect(out.provider).toBe('openai');
    expect(out.model).toBe('gpt-test');
  });

  it('propagates error events', () => {
    const frames = parseSse('event: error\ndata: {"type":"error","error":"boom"}\n\n');
    expect(() => reduceSse(frames)).toThrow('boom');
  });

  it('tolerates non-JSON frames', () => {
    const frames = parseSse('data: keep-alive\n\nevent: delta\ndata: {"type":"delta","text":"ok"}\n\n');
    const out = reduceSse(frames);
    expect(out.content).toBe('ok');
  });
});
