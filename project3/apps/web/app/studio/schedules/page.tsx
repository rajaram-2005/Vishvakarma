'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

interface Schedule {
  id: string;
  name: string;
  expr: string;
  nextRun?: string;
  status?: string;
}

export default function SchedulesPage() {
  const [list, setList] = useState<Schedule[]>([]);
  const [name, setName] = useState('');
  const [request, setRequest] = useState('Research solar EV charging');
  const [expr, setExpr] = useState('every saturday');
  const [ran, setRan] = useState<number | null>(null);

  async function refresh() {
    setList((await studioClient.schedules()) as Schedule[]);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    await studioClient.addSchedule(name || 'My schedule', request, expr);
    setName(''); setRequest(''); setExpr('every saturday');
    await refresh();
  }
  async function tick() {
    const r = await studioClient.tickSchedules();
    setRan(r.ran);
    await refresh();
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Schedules</h1>
      <section style={{ marginBottom: 16 }}>
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, marginRight: 6 }} />
        <input placeholder="request" value={request} onChange={(e) => setRequest(e.target.value)} style={{ padding: 6, marginRight: 6, width: 260 }} />
        <input placeholder="expr (e.g. every saturday)" value={expr} onChange={(e) => setExpr(e.target.value)} style={{ padding: 6, marginRight: 6 }} />
        <button onClick={add} style={{ padding: 6 }}>Add schedule</button>{' '}
        <button onClick={tick} style={{ padding: 6, marginLeft: 6 }}>Run due ({ran ?? '—'})</button>
      </section>
      <h2>Defined schedules</h2>
      <ul>{list.map((s) => <li key={s.id}>{s.name} · <code>{s.expr}</code> · next {s.nextRun ?? '—'}</li>)}</ul>
    </main>
  );
}
