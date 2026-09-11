// Aetherion Fabricate — mesh exporters. Pure functions: OBJ (text) and GLTF 2.0
// (JSON with an embedded base64 buffer). Both open in Blender, Three.js,
// Windows 3D Viewer, Babylon.js sandbox, etc.

import type { Mesh } from './geometry';

export function meshToObj(mesh: Mesh, name = 'sutra_object'): string {
  const { positions, indices } = mesh;
  const lines: string[] = [`# Aetherion Fabricate — ${name}`, `o ${name}`];
  for (let i = 0; i < positions.length; i += 3) {
    lines.push(
      `v ${positions[i].toFixed(6)} ${positions[i + 1].toFixed(6)} ${positions[i + 2].toFixed(6)}`,
    );
  }
  for (let i = 0; i < indices.length; i += 3) {
    lines.push(`f ${indices[i] + 1} ${indices[i + 1] + 1} ${indices[i + 2] + 1}`);
  }
  return lines.join('\n') + '\n';
}

/** GLTF 2.0 JSON with the vertex/index data embedded as a base64 data URI. */
export function meshToGltf(mesh: Mesh, name = 'sutra_object'): string {
  const { positions, indices } = mesh;

  const vertexCount = positions.length / 3;
  const posBytes = new Float32Array(positions);
  const idxBytes = new Uint32Array(indices);

  // interleave: positions first, then indices, 4-byte aligned
  const posByteLen = posBytes.byteLength;
  const pad = (4 - (posByteLen % 4)) % 4;
  const buffer = new ArrayBuffer(posByteLen + pad + idxBytes.byteLength);
  new Uint8Array(buffer).set(new Uint8Array(posBytes.buffer, posBytes.byteOffset, posByteLen), 0);
  new Uint8Array(buffer).set(new Uint8Array(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength), posByteLen + pad);

  // base64 of the buffer
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const b64 = btoa(binary);

  // bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const gltf = {
    asset: { version: '2.0', generator: 'Aetherion Fabricate' },
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name: `${name}_mesh`, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'sutra_material', pbrMetallicRoughness: { baseColorFactor: [0.545, 0.361, 0.965, 1], metallicFactor: 0.2, roughnessFactor: 0.55 } }],
    buffers: [{ uri: `data:application/octet-stream;base64,${b64}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posByteLen, target: 34962 },
      { buffer: 0, byteOffset: posByteLen + pad, byteLength: idxBytes.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, byteOffset: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };
  return JSON.stringify(gltf);
}

/** A minimal STORE-only ZIP writer (no compression — fully spec-valid). */
export function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0x0800, true); // UTF-8 names
    dv.setUint16(8, 0, true); // method: store
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0, true); // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); // extra len
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true); // central directory signature
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true); // method: store
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);

    localParts.push(local, f.data);
    centralParts.push(central);
    offset += local.length + f.data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of [...localParts, ...centralParts, end]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
