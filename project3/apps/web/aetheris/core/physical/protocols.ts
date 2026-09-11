/**
 * Minimal, dependency-free protocol clients for the Physical AI layer (Phase 13).
 *
 *   MqttClient   MQTT 3.1.1 over TCP (CONNECT/PUBLISH QoS0-1/SUBSCRIBE/PING/DISCONNECT). No TLS/websocket.
 *   ModbusTcp    Modbus/TCP FC01 (coils), FC03 (holding regs), FC04 (input regs), FC05 (write coil), FC06 (write reg), FC16 (write regs)
 *
 * Status: IMPLEMENTED per spec and verified against in-repo protocol mocks; UNVERIFIED on real brokers/PLCs
 * from this sandbox (no egress, no hardware). Pure encoders/decoders are exported for testing.
 */
import net from "node:net";

// ---- MQTT ---------------------------------------------------------------------------------------
const enc16 = (n: number) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const mstr = (s: string) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([enc16(b.length), b]); };
function remLen(n: number) { const out: number[] = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 0x80; out.push(d); } while (n > 0); return Buffer.from(out); }
export const mqttPacket = {
  connect(clientId: string, opts: { username?: string; password?: string; keepalive?: number; clean?: boolean } = {}) {
    let flags = (opts.clean ?? true) ? 0x02 : 0; if (opts.username) flags |= 0x80; if (opts.password) flags |= 0x40;
    const body = Buffer.concat([mstr("MQTT"), Buffer.from([4, flags]), enc16(opts.keepalive ?? 60), mstr(clientId), ...(opts.username ? [mstr(opts.username)] : []), ...(opts.password ? [mstr(opts.password)] : [])]);
    return Buffer.concat([Buffer.from([0x10]), remLen(body.length), body]);
  },
  publish(topic: string, payload: Buffer | string, opts: { qos?: 0 | 1; retain?: boolean; id?: number } = {}) {
    const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload); const qos = opts.qos ?? 0;
    const body = Buffer.concat([mstr(topic), ...(qos ? [enc16(opts.id ?? 1)] : []), p]);
    return Buffer.concat([Buffer.from([0x30 | (qos << 1) | (opts.retain ? 1 : 0)]), remLen(body.length), body]);
  },
  subscribe(topics: string[], id = 1, qos: 0 | 1 = 0) { const body = Buffer.concat([enc16(id), ...topics.flatMap((t) => [mstr(t), Buffer.from([qos])])]); return Buffer.concat([Buffer.from([0x82]), remLen(body.length), body]); },
  pingreq: () => Buffer.from([0xc0, 0]), disconnect: () => Buffer.from([0xe0, 0]),
  /** Parse one or more packets from a buffer; returns packets + remaining bytes. */
  parse(buf: Buffer): { packets: { type: number; flags: number; body: Buffer }[]; rest: Buffer } {
    const packets: { type: number; flags: number; body: Buffer }[] = []; let i = 0;
    while (i < buf.length) {
      const h = buf[i]; let mult = 1, len = 0, j = i + 1; let d: number;
      do { if (j >= buf.length) return { packets, rest: buf.subarray(i) }; d = buf[j++]; len += (d & 127) * mult; mult *= 128; } while (d & 128);
      if (j + len > buf.length) return { packets, rest: buf.subarray(i) };
      packets.push({ type: h >> 4, flags: h & 0x0f, body: buf.subarray(j, j + len) }); i = j + len;
    }
    return { packets, rest: Buffer.alloc(0) };
  },
  decodePublish(flags: number, body: Buffer) { const tl = body.readUInt16BE(0); const topic = body.subarray(2, 2 + tl).toString("utf8"); const qos = (flags >> 1) & 3; let o = 2 + tl; let id: number | undefined; if (qos) { id = body.readUInt16BE(o); o += 2; } return { topic, qos, id, payload: body.subarray(o) }; },
};

export class MqttClient {
  private sock?: net.Socket; private buf: Buffer = Buffer.alloc(0); private nextId = 1; private handlers: ((topic: string, payload: Buffer) => void)[] = []; private waiters = new Map<string, (b: Buffer) => void>(); private ping?: NodeJS.Timeout;
  constructor(private host: string, private port = 1883, private auth: { username?: string; password?: string; clientId?: string } = {}) {}
  connect(timeoutMs = 8000): Promise<void> {
    return new Promise((res, rej) => {
      const s = net.createConnection({ host: this.host, port: this.port }); this.sock = s; const t = setTimeout(() => { s.destroy(); rej(new Error("mqtt connect timeout")); }, timeoutMs);
      s.once("error", (e) => { clearTimeout(t); rej(e); });
      s.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); const { packets, rest } = mqttPacket.parse(this.buf); this.buf = rest; for (const p of packets) this.on(p); });
      s.once("connect", () => s.write(mqttPacket.connect(this.auth.clientId ?? `aetheris-${Math.random().toString(36).slice(2, 8)}`, this.auth)));
      this.waiters.set("connack", (b) => { clearTimeout(t); if (b[1] !== 0) rej(new Error(`mqtt CONNACK code ${b[1]}`)); else { this.ping = setInterval(() => s.write(mqttPacket.pingreq()), 45_000); res(); } });
    });
  }
  private on(p: { type: number; flags: number; body: Buffer }) {
    if (p.type === 2) this.waiters.get("connack")?.(p.body);
    else if (p.type === 4) this.waiters.get(`puback:${p.body.readUInt16BE(0)}`)?.(p.body);
    else if (p.type === 9) this.waiters.get(`suback:${p.body.readUInt16BE(0)}`)?.(p.body);
    else if (p.type === 3) { const m = mqttPacket.decodePublish(p.flags, p.body); if (m.qos === 1 && m.id !== undefined) this.sock?.write(Buffer.concat([Buffer.from([0x40, 2]), enc16(m.id)])); this.handlers.forEach((h) => h(m.topic, m.payload)); }
  }
  private await(key: string, ms = 5000) { return new Promise<Buffer>((res, rej) => { const t = setTimeout(() => { this.waiters.delete(key); rej(new Error(`${key} timeout`)); }, ms); this.waiters.set(key, (b) => { clearTimeout(t); this.waiters.delete(key); res(b); }); }); }
  async publish(topic: string, payload: string | Buffer, opts: { qos?: 0 | 1; retain?: boolean } = {}) { if (!this.sock) throw new Error("not connected"); const id = this.nextId++ % 65535 || 1; this.sock.write(mqttPacket.publish(topic, payload, { ...opts, id })); if (opts.qos === 1) await this.await(`puback:${id}`); }
  async subscribe(topics: string[], handler: (topic: string, payload: Buffer) => void) { if (!this.sock) throw new Error("not connected"); const id = this.nextId++ % 65535 || 1; this.handlers.push(handler); this.sock.write(mqttPacket.subscribe(topics, id)); await this.await(`suback:${id}`); }
  close() { if (this.ping) clearInterval(this.ping); try { this.sock?.write(mqttPacket.disconnect()); } catch { /* ignore */ } this.sock?.end(); this.sock?.destroy(); }
}

// ---- Modbus/TCP -----------------------------------------------------------------------------------
export const modbusFrame = {
  build(tid: number, unit: number, fc: number, data: Buffer) { const pdu = Buffer.concat([Buffer.from([fc]), data]); const mbap = Buffer.alloc(7); mbap.writeUInt16BE(tid, 0); mbap.writeUInt16BE(0, 2); mbap.writeUInt16BE(pdu.length + 1, 4); mbap[6] = unit; return Buffer.concat([mbap, pdu]); },
  readReq(tid: number, unit: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) { const d = Buffer.alloc(4); d.writeUInt16BE(addr, 0); d.writeUInt16BE(qty, 2); return modbusFrame.build(tid, unit, fc, d); },
  writeSingle(tid: number, unit: number, fc: 5 | 6, addr: number, value: number) { const d = Buffer.alloc(4); d.writeUInt16BE(addr, 0); d.writeUInt16BE(fc === 5 ? (value ? 0xff00 : 0) : value & 0xffff, 2); return modbusFrame.build(tid, unit, fc, d); },
  writeMultiple(tid: number, unit: number, addr: number, values: number[]) { const d = Buffer.alloc(5 + values.length * 2); d.writeUInt16BE(addr, 0); d.writeUInt16BE(values.length, 2); d[4] = values.length * 2; values.forEach((v, i) => d.writeUInt16BE(v & 0xffff, 5 + i * 2)); return modbusFrame.build(tid, unit, 16, d); },
  /** Parse a response; throws on Modbus exception. */
  parse(buf: Buffer): { tid: number; unit: number; fc: number; data: Buffer } {
    if (buf.length < 8) throw new Error("short modbus frame"); const len = buf.readUInt16BE(4); const fc = buf[7];
    if (fc & 0x80) throw new Error(`modbus exception ${buf[8]} (${({ 1: "illegal function", 2: "illegal data address", 3: "illegal data value", 4: "slave device failure" } as Record<number, string>)[buf[8]] ?? "unknown"})`);
    return { tid: buf.readUInt16BE(0), unit: buf[6], fc, data: buf.subarray(8, 6 + len) };
  },
  regs(data: Buffer) { const n = data[0] / 2; const out: number[] = []; for (let i = 0; i < n; i++) out.push(data.readUInt16BE(1 + i * 2)); return out; },
  bits(data: Buffer, qty: number) { const out: boolean[] = []; for (let i = 0; i < qty; i++) out.push(!!(data[1 + (i >> 3)] & (1 << (i & 7)))); return out; },
};
export class ModbusTcp {
  private tid = 0;
  constructor(private host: string, private port = 502, private unit = 1, private timeoutMs = 5000) {}
  private tx(frame: Buffer): Promise<Buffer> {
    return new Promise((res, rej) => {
      const s = net.createConnection({ host: this.host, port: this.port }); const t = setTimeout(() => { s.destroy(); rej(new Error("modbus timeout")); }, this.timeoutMs); let acc = Buffer.alloc(0);
      s.once("error", (e) => { clearTimeout(t); rej(e); }); s.once("connect", () => s.write(frame));
      s.on("data", (d) => { acc = Buffer.concat([acc, d]); if (acc.length >= 6 && acc.length >= 6 + acc.readUInt16BE(4)) { clearTimeout(t); s.end(); s.destroy(); res(acc); } });
    });
  }
  private next() { this.tid = (this.tid + 1) & 0xffff; return this.tid; }
  async readCoils(addr: number, qty: number) { return modbusFrame.bits(modbusFrame.parse(await this.tx(modbusFrame.readReq(this.next(), this.unit, 1, addr, qty))).data, qty); }
  async readDiscrete(addr: number, qty: number) { return modbusFrame.bits(modbusFrame.parse(await this.tx(modbusFrame.readReq(this.next(), this.unit, 2, addr, qty))).data, qty); }
  async readHolding(addr: number, qty: number) { return modbusFrame.regs(modbusFrame.parse(await this.tx(modbusFrame.readReq(this.next(), this.unit, 3, addr, qty))).data); }
  async readInput(addr: number, qty: number) { return modbusFrame.regs(modbusFrame.parse(await this.tx(modbusFrame.readReq(this.next(), this.unit, 4, addr, qty))).data); }
  async writeCoil(addr: number, on: boolean) { modbusFrame.parse(await this.tx(modbusFrame.writeSingle(this.next(), this.unit, 5, addr, on ? 1 : 0))); }
  async writeRegister(addr: number, value: number) { modbusFrame.parse(await this.tx(modbusFrame.writeSingle(this.next(), this.unit, 6, addr, value))); }
  async writeRegisters(addr: number, values: number[]) { modbusFrame.parse(await this.tx(modbusFrame.writeMultiple(this.next(), this.unit, addr, values))); }
}
