// §69 — Security Center. One place aggregating security alerts, connected
// services, plugins, MCP, API keys, sessions, devices, audit logs and policies.
// Subscribes to the core event bus so alerts surface automatically.

import type { RiskLevel } from '@sutra/shared';

export interface SecurityAlert {
  id: string;
  risk: RiskLevel;
  detail: string;
  at: string;
  resolved?: boolean;
}

export interface SecuritySession {
  id: string;
  device: string;
  startedAt: string;
  permissions: string[];
}

export interface Device {
  id: string;
  platform: string;
  lastActive: string;
}

export interface AuditLog {
  at: string;
  actor: string;
  action: string;
}

export class SecurityCenter {
  private alerts: SecurityAlert[] = [];
  private sessions = new Map<string, SecuritySession>();
  private devices = new Map<string, Device>();
  private audit: AuditLog[] = [];
  private policies = new Map<string, boolean>();

  /** Attach to the core bus to capture security-relevant events. */
  attach(bus: { on: <K extends string>(name: K, h: (p: any) => void) => void }): void {
    bus.on('security.alert' as never, ((p: { risk: RiskLevel; detail: string }) => {
      this.raise(p.risk, p.detail);
    }) as never);
    bus.on('task.failed' as never, ((p: { taskId: string; error: string }) => {
      this.audit.push({ at: new Date().toISOString(), actor: 'system', action: `task.failed:${p.taskId}` });
    }) as never);
  }

  raise(risk: RiskLevel, detail: string): SecurityAlert {
    const a: SecurityAlert = { id: `sec_${this.alerts.length + 1}`, risk, detail, at: new Date().toISOString() };
    this.alerts.push(a);
    return a;
  }

  addSession(id: string, device: string, permissions: string[]): SecuritySession {
    const s: SecuritySession = { id, device, startedAt: new Date().toISOString(), permissions };
    this.sessions.set(id, s);
    return s;
  }

  addDevice(id: string, platform: string): Device {
    const d: Device = { id, platform, lastActive: new Date().toISOString() };
    this.devices.set(id, d);
    return d;
  }

  setPolicy(name: string, enabled: boolean): void {
    this.policies.set(name, enabled);
  }

  logs(action: string, actor = 'user'): void {
    this.audit.push({ at: new Date().toISOString(), actor, action });
  }

  summary() {
    return {
      openAlerts: this.alerts.filter((a) => !a.resolved).length,
      sessions: this.sessions.size,
      devices: this.devices.size,
      policies: [...this.policies.entries()],
      auditCount: this.audit.length,
    };
  }
}
