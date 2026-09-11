/**
 * Execution policy — capability-based permissions with confirmation gates and an audit trail.
 *
 *   Execution Request → Permission Check → Security Policy → (Sandbox) → Command → Output → Verifier
 *
 * Levels (ordered): READ_ONLY < SAFE_WRITE < FULL_WORKSPACE < ADMIN, plus PHYSICAL for real-world
 * actuation which is never implied by any other level. Defaults are least-privilege: a user's
 * baseline is SAFE_WRITE for their own data, tools declare what they need, and anything at
 * FULL_WORKSPACE/ADMIN/PHYSICAL or flagged `requires_confirmation` must carry an explicit,
 * single-use confirmation token.
 */
import { SECURITY_RANK, type SecurityLevel } from "../capabilities/types";
import { record } from "../observability/events";

export type PermissionLevel = SecurityLevel;
export interface Principal { uid: string; grants: PermissionLevel[]; /** ids of capabilities explicitly allowed regardless of level (allow-list) */ allow?: string[]; /** explicitly denied capability ids */ deny?: string[] }
export interface ExecutionRequest { principal: Principal; capabilityId: string; required: PermissionLevel; requiresConfirmation?: boolean; confirmationToken?: string; args?: Record<string, unknown>; workspace?: string; /** Safety stops (E-stop, cancel) must never wait for a confirmation dialog. Level is still enforced. */ stopAction?: boolean }
export type Decision = { allow: true; reason: string } | { allow: false; reason: string; code: "denied" | "insufficient_level" | "needs_confirmation" | "bad_token" };

export const DEFAULT_GRANTS: PermissionLevel[] = ["read_only", "safe_write"];

export function highestLevel(grants: PermissionLevel[]): PermissionLevel { return grants.reduce((h, g) => (SECURITY_RANK[g] > SECURITY_RANK[h] ? g : h), "read_only" as PermissionLevel); }
export function hasLevel(p: Principal, level: PermissionLevel): boolean {
  if (level === "physical") return p.grants.includes("physical"); // never implied
  return SECURITY_RANK[highestLevel(p.grants.filter((g) => g !== "physical"))] >= SECURITY_RANK[level];
}

// ---- confirmation tokens (single-use, short-lived, bound to uid+capability) ----
const tokens = new Map<string, { uid: string; capabilityId: string; exp: number }>();
export function issueConfirmation(uid: string, capabilityId: string, ttlMs = 5 * 60_000): string {
  const t = Math.random().toString(36).slice(2) + Date.now().toString(36);
  tokens.set(t, { uid, capabilityId, exp: Date.now() + ttlMs });
  return t;
}
function consumeConfirmation(token: string | undefined, uid: string, capabilityId: string): boolean {
  if (!token) return false; const t = tokens.get(token); tokens.delete(token);
  return !!t && t.uid === uid && t.capabilityId === capabilityId && t.exp > Date.now();
}

/** Pure decision (no side effects) — exported for tests. */
export function decide(req: ExecutionRequest): Decision {
  const { principal: p, capabilityId, required } = req;
  if (p.deny?.includes(capabilityId)) return { allow: false, code: "denied", reason: `${capabilityId} is on the deny list` };
  const listed = p.allow?.includes(capabilityId);
  // Self-service escalation: a confirmed token lets a safe_write principal run full_workspace
  // capabilities on their OWN sandboxed workspace (never admin/physical).
  const selfEscalate = required === "full_workspace" && hasLevel(p, "safe_write") && !!req.confirmationToken;
  if (!listed && !selfEscalate && !hasLevel(p, required)) return { allow: false, code: "insufficient_level", reason: `${capabilityId} needs ${required}; principal has ${highestLevel(p.grants)}${p.grants.includes("physical") ? "+physical" : ""}` };
  const gate = !req.stopAction && (req.requiresConfirmation || SECURITY_RANK[required] >= SECURITY_RANK.full_workspace);
  if (gate) {
    if (!req.confirmationToken) return { allow: false, code: "needs_confirmation", reason: `${capabilityId} (${required}) requires explicit confirmation` };
    if (!consumeConfirmation(req.confirmationToken, p.uid, capabilityId)) return { allow: false, code: "bad_token", reason: "confirmation token invalid, expired or already used" };
  }
  return { allow: true, reason: listed ? "explicitly allowed" : `level ${required} granted` };
}

/** Decide + audit. Use this from routes/tools. */
export function authorize(req: ExecutionRequest): Decision {
  const d = decide(req);
  record({ type: "permission", uid: req.principal.uid, capability: req.capabilityId, ok: d.allow, detail: d.allow ? d.reason : `${d.code}: ${d.reason}`, meta: { required: req.required, workspace: req.workspace } });
  return d;
}

/** Baseline principal for a request. Admins (AETHERIS_ADMIN_UIDS) get admin; physical is never default. */
export function principalFor(uid: string, opts: { admin?: boolean } = {}): Principal {
  const grants: PermissionLevel[] = [...DEFAULT_GRANTS];
  if (opts.admin || (process.env.AETHERIS_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(uid)) grants.push("full_workspace", "admin");
  return { uid, grants };
}
