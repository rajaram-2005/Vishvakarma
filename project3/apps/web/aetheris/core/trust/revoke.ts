/**
 * Trust / Revocation.
 *
 *   A write-side flow that lets the user revoke a
 *   capability grant for their own principal. The flow is:
 *     1. recordRevoke(uid, capabilityId) — appends a row to
 *        the 'trust-revocations' collection with a createdAt
 *        timestamp.
 *     2. trustSummary(uid) reads the collection and the deny
 *        list; revoked capabilities show up as denied.
 *     3. clearRevoke(uid, capabilityId) — removes the row.
 *
 *   The flow is auditable: every revoke records an
 *   observability event of type 'permission' with ok=false
 *   and a 'revoked' detail. No policy is changed; the
 *   existing authorize() is still the gate. This is a
 *   user-level UI sugar on top of the deny list.
 *
 *   Safety: revoke is a write API. It runs at safe_write.
 *   Clearing a revoke also runs at safe_write. The flow is
 *   tested.
 */

import { record } from "@/aetheris/core/observability/events";
import { store } from "@/aetheris/lib/store";

const COL = "trust-revocations";
const id = (uid: string, capabilityId: string) => `${uid}:${capabilityId}`;

export interface Revocation {
  uid: string;
  capabilityId: string;
  createdAt: number;
  reason?: string;
}

export async function listRevocations(uid: string): Promise<Revocation[]> {
  const all = await store.all<Revocation>(COL);
  return Object.values(all).filter((r) => r.uid === uid);
}

export async function isRevoked(uid: string, capabilityId: string): Promise<boolean> {
  const r = await store.get<Revocation>(COL, id(uid, capabilityId));
  return r !== null && r !== undefined;
}

export async function recordRevoke(uid: string, capabilityId: string, opts: { reason?: string } = {}): Promise<Revocation> {
  const r: Revocation = { uid, capabilityId, createdAt: Date.now(), reason: opts.reason };
  await store.set(COL, id(uid, capabilityId), r);
  record({ type: "permission", uid, capability: capabilityId, ok: false, ms: 0, detail: `revoked${opts.reason ? `: ${opts.reason}` : ""}` });
  return r;
}

export async function clearRevoke(uid: string, capabilityId: string): Promise<boolean> {
  const existed = await isRevoked(uid, capabilityId);
  await store.remove(COL, id(uid, capabilityId));
  if (existed) record({ type: "permission", uid, capability: capabilityId, ok: true, ms: 0, detail: "revocation cleared" });
  return existed;
}
