// §35 (Approval Center) / §34 (AI + Human handoff) / §7 (WAITING_FOR_PERMISSION).
//
// One universal approval queue. Supports Approve / Deny / Inspect / Approve
// Once / Approve Session / Always Ask, plus per-category session grants that
// never mask critical risks.

import type { RiskLevel } from '@sutra/shared';

export type ApprovalAction = 'approve' | 'deny' | 'approve-once' | 'approve-session' | 'always-ask' | 'inspect';
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalRequest {
  id: string;
  task: string;
  requestedAction: string;
  risk: RiskLevel;
  reasons: string[];
  files?: string[];
  destination?: string;
  model?: string;
  plugin?: string;
  mcp?: string;
  createdAt: string;
  status: ApprovalStatus;
  decision?: ApprovalAction;
}

export interface ApprovalDecision {
  allow: boolean;
  action: ApprovalAction;
}

export class ApprovalCenter {
  private queue: ApprovalRequest[] = [];
  private sessionGrants = new Set<string>();
  private alwaysAsk = new Set<string>();

  /** Create a pending request and enqueue it. */
  request(req: Omit<ApprovalRequest, 'id' | 'createdAt' | 'status'>): ApprovalRequest {
    const full: ApprovalRequest = {
      ...req,
      id: `apr_${this.queue.length + 1}_${Math.abs(hash(req.task + req.requestedAction))}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.queue.push(full);
    return full;
  }

  list(status?: ApprovalStatus): ApprovalRequest[] {
    return this.queue.filter((r) => (status ? r.status === status : true));
  }

  get(id: string): ApprovalRequest | undefined {
    return this.queue.find((r) => r.id === id);
  }

  /** Decide on a request. Critical risks are always re-asked (never masked). */
  decide(id: string, action: ApprovalAction): ApprovalRequest {
    const req = this.get(id);
    if (!req) throw new Error(`Unknown approval request: ${id}`);
    req.decision = action;
    if (action === 'deny') {
      req.status = 'denied';
      return req;
    }
    // Inspect is not a terminal decision; keep pending.
    if (action === 'inspect') {
      req.status = 'pending';
      return req;
    }
    if (action === 'always-ask') this.alwaysAsk.add(req.risk);
    if (action === 'approve-session') this.sessionGrants.add(req.risk);
    req.status = 'approved';
    return req;
  }

  /** Whether a given risk is already granted for this session. */
  isGranted(risk: RiskLevel): boolean {
    if (this.alwaysAsk.has(risk)) return false; // always re-ask
    return this.sessionGrants.has(risk);
  }

  /** Resolve a permission requirement: returns allow + the action taken. */
  resolve(risk: RiskLevel, auto: ApprovalAction = 'approve-once'): ApprovalDecision {
    if (risk === 'critical') return { allow: false, action: 'always-ask' }; // force human
    if (this.isGranted(risk)) return { allow: true, action: 'approve-session' };
    return { allow: auto !== 'deny', action: auto };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
