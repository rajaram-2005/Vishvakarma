// §47 — Notification Engine. One notification system for all surfaces, with
// channel routing (in-app / push / email / webhook) and per-topic rules.

export type Channel = 'in-app' | 'push' | 'email' | 'webhook';

export interface Notification {
  id: string;
  channel: Channel;
  topic: string;
  title: string;
  body: string;
  at: string;
  read?: boolean;
}

export type Delivery = { channel: Channel; ok: boolean; error?: string };

export class NotificationEngine {
  private handlers = new Map<Channel, Array<(n: Notification) => void>>();
  private sent: Notification[] = [];

  on(channel: Channel, handler: (n: Notification) => void): void {
    const list = this.handlers.get(channel) ?? [];
    list.push(handler);
    this.handlers.set(channel, list);
  }

  /** Send a notification to one or more channels. Failures are isolated. */
  send(n: Omit<Notification, 'id' | 'at'> & Partial<Pick<Notification, 'id' | 'at'>>, channels: Channel[] = ['in-app']): Delivery[] {
    const full: Notification = {
      id: n.id ?? `ntf_${this.sent.length + 1}`,
      at: n.at ?? new Date().toISOString(),
      ...n,
    };
    this.sent.push(full);
    const out: Delivery[] = [];
    for (const ch of channels) {
      try {
        for (const h of this.handlers.get(ch) ?? []) h(full);
        out.push({ channel: ch, ok: true });
      } catch (e) {
        out.push({ channel: ch, ok: false, error: (e as Error).message });
      }
    }
    return out;
  }

  /** Topic-level routing rule: which channels a topic should use. */
  route(topic: string): Channel[] {
    if (topic.startsWith('security')) return ['in-app', 'push', 'email'];
    if (topic.startsWith('schedule')) return ['in-app', 'push'];
    return ['in-app'];
  }

  recent(limit = 50): Notification[] {
    return this.sent.slice(-limit);
  }
}
