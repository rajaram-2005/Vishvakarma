'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

interface Item {
  id: string;
  at: string;
  kind: string;
  text: string;
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<Item[]>([]);
  const [notifications, setNotifications] = useState<Item[]>([]);

  useEffect(() => {
    studioClient.activity().then((d) => setActivity(d.items)).catch(() => {});
    studioClient.notifications().then((d) => setNotifications(d.items)).catch(() => {});
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Activity & Notifications</h1>
      <section style={{ marginBottom: 20 }}>
        <h2>Recent activity</h2>
        <ul>{activity.map((a) => <li key={a.id}><span style={{ color: '#9fb3c8' }}>{a.at.slice(0, 19)}</span> · {a.text}</li>)}</ul>
      </section>
      <section>
        <h2>Notifications</h2>
        <ul>{notifications.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
      </section>
    </main>
  );
}
