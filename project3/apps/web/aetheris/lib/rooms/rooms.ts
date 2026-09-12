import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { store } from "@/aetheris/lib/store";

/**
 * Real-time collaborative rooms. Several people share one chat; each message is attributed to a
 * participant, the AI answers in the same room. Persistence = JSON store; fan-out = in-process
 * EventEmitter over SSE (single-instance). Polling `since=` keeps it working behind any proxy.
 */
export interface RoomMessage { id: string; role: "user" | "assistant" | "system"; content: string; author?: { uid: string; name: string; color: string }; provider?: string; model?: string; at: number; streaming?: boolean }
export interface Participant { uid: string; name: string; color: string; lastSeen: number }
export interface Room { id: string; title: string; ownerUid: string; createdAt: number; updatedAt: number; messages: RoomMessage[]; participants: Record<string, Participant>; seq: number }

const COL = "rooms";
export type RoomEvent = { seq: number; type: "message" | "delta" | "presence" | "title"; room: string; data: unknown; at: number };
// Hoisted onto globalThis so every route bundle (Next compiles them separately in dev) shares one bus.
const g = globalThis as unknown as { __aethRoomBus?: EventEmitter; __aethRoomRecent?: Map<string, RoomEvent[]> };
const bus = g.__aethRoomBus ??= (() => { const e = new EventEmitter(); e.setMaxListeners(0); return e; })();
const COLORS = ["#7c9cff", "#c084fc", "#3ecf8e", "#f6ad55", "#f687b3", "#63b3ed", "#fbd38d", "#9ae6b4"];

const recent = g.__aethRoomRecent ??= new Map<string, RoomEvent[]>(); // per-room ring buffer for `since=`

export function nameFor(uid: string, fallback?: string) { return fallback || `Guest ${uid.slice(0, 4)}`; }
export function colorFor(uid: string) { let h = 0; for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }

export async function createRoom(ownerUid: string, title: string, seed: RoomMessage[] = []): Promise<Room> {
  const id = randomBytes(5).toString("base64url");
  const room: Room = { id, title: title.slice(0, 120) || "Room", ownerUid, createdAt: Date.now(), updatedAt: Date.now(), messages: seed, participants: {}, seq: 0 };
  await store.set(COL, id, room);
  return room;
}
export const getRoom = (id: string) => store.get<Room>(COL, id);

const seqs = (g as { __aethRoomSeq?: Map<string, number> }).__aethRoomSeq ??= new Map<string, number>();
function emit(room: Room, type: RoomEvent["type"], data: unknown) {
  const seq = Math.max(seqs.get(room.id) ?? 0, room.seq) + 1;
  seqs.set(room.id, seq);
  void store.update<Room>(COL, room.id, (r) => ({ ...(r ?? room), seq })).catch(() => undefined);
  const ev: RoomEvent = { seq, type, room: room.id, data, at: Date.now() };
  const buf = recent.get(room.id) ?? []; buf.push(ev); if (buf.length > 500) buf.splice(0, buf.length - 500); recent.set(room.id, buf);
  bus.emit(room.id, ev);
  return ev;
}

export async function touchPresence(id: string, uid: string, name?: string) {
  const room = await store.update<Room>(COL, id, (r) => {
    if (!r) throw new Error("room not found");
    const p = r.participants[uid] ?? { uid, name: nameFor(uid, name), color: colorFor(uid), lastSeen: 0 };
    if (name) p.name = name;
    p.lastSeen = Date.now();
    return { ...r, participants: { ...r.participants, [uid]: p } };
  });
  emit(room, "presence", activeParticipants(room));
  return room;
}
export function activeParticipants(room: Room) { const cut = Date.now() - 60_000; return Object.values(room.participants).filter((p) => p.lastSeen > cut); }

export async function appendMessage(id: string, msg: Omit<RoomMessage, "id" | "at"> & { id?: string }): Promise<RoomMessage> {
  const m: RoomMessage = { id: msg.id ?? randomBytes(6).toString("hex"), at: Date.now(), ...msg };
  const room = await store.update<Room>(COL, id, (r) => {
    if (!r) throw new Error("room not found");
    const messages = r.messages.some((x) => x.id === m.id) ? r.messages.map((x) => (x.id === m.id ? m : x)) : [...r.messages, m].slice(-400);
    return { ...r, messages, updatedAt: Date.now() };
  });
  emit(room, "message", m);
  return m;
}

/** Stream a delta for an in-progress assistant message (not persisted until appendMessage). */
export async function emitDelta(id: string, msgId: string, text: string) {
  const room = await getRoom(id); if (!room) return;
  emit(room, "delta", { id: msgId, text });
}

export function subscribe(id: string, fn: (ev: RoomEvent) => void, since = 0) {
  for (const ev of recent.get(id) ?? []) if (ev.seq > since) fn(ev);
  bus.on(id, fn);
  return () => bus.off(id, fn);
}
export async function eventsSince(id: string, since: number): Promise<RoomEvent[]> {
  const buf = (recent.get(id) ?? []).filter((e) => e.seq > since);
  if (buf.length || since === 0) return buf;
  // Buffer lost (restart / other instance): re-send the full message list as message events so pollers resync.
  const room = await getRoom(id); if (!room || room.seq <= since) return [];
  return room.messages.map((m, i) => ({ seq: room.seq - room.messages.length + i + 1, type: "message" as const, room: id, data: m, at: m.at })).filter((e) => e.seq > since);
}
