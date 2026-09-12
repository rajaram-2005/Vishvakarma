// §49 — Unified Recent Activity timeline. One stream of notable events across
// chat, library, models, coder, studio, schedules, workflows, plugins, MCP and
// security.

export interface ActivityItem {
  id: string;
  at: string;
  kind: string; // 'model.installed' | 'research.started' | 'pdf.indexed' | ...
  text: string;
  meta?: Record<string, unknown>;
}

export class ActivityFeed {
  private items: ActivityItem[] = [];

  record(kind: string, text: string, meta?: Record<string, unknown>, at = new Date()): ActivityItem {
    const item: ActivityItem = { id: `act_${this.items.length + 1}`, at: at.toISOString(), kind, text, meta };
    this.items.push(item);
    return item;
  }

  /** Bridge the core event bus into the activity feed. */
  attach(bus: { on: <K extends string>(name: K, h: (p: any) => void) => void }): void {
    const map: Record<string, string> = {
      'model.installed': 'Model installed',
      'chat.completed': 'Chat completed',
      'coder.completed': 'Coder completed',
      'studio.generated': 'Studio generated',
      'schedule.started': 'Schedule started',
      'plugin.updated': 'Plugin updated',
      'task.completed': 'Task completed',
      'task.failed': 'Task failed',
    };
    for (const [evt, label] of Object.entries(map)) {
      bus.on(evt as never, ((p: any) => this.record(evt, label, p)) as never);
    }
  }

  recent(limit = 50): ActivityItem[] {
    return this.items.slice(-limit);
  }
}
