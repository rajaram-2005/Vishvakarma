'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { studioClient } from '@/lib/studio-client';

const SURFACES = [
  ['/studio/chat', 'Chat', 'Universal entry point'],
  ['/studio/library', 'Library', 'Knowledge store'],
  ['/studio/models', 'Models', 'Routing & health'],
  ['/studio/workflows', 'Workflows', 'Visual builder'],
  ['/studio/schedules', 'Schedules', 'Recurring jobs'],
  ['/studio/coder', 'Coder', 'Code generation'],
  ['/studio/studio', 'Studio', 'Creative generation'],
  ['/studio/security', 'Security', 'Center & alerts'],
  ['/studio/marketplace', 'Marketplace', 'Trust & publishers'],
];

export default function StudioHome() {
  const [status, setStatus] = useState<Record<string, number> | null>(null);
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    studioClient.status().then(setStatus);
    studioClient.me().then((m) => setMe(m));
  }, []);

  async function doLogin() {
    try {
      await studioClient.login(email, password);
      setMe(await studioClient.me());
      setMsg('logged in');
    } catch {
      setMsg('login failed');
    }
  }
  async function doRegister() {
    try {
      await studioClient.register(email, password);
      await doLogin();
    } catch {
      setMsg('register failed');
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Unified AI Studio — ONE CORE</h1>
      <section style={{ marginBottom: 16 }}>
        {status ? <pre style={{ display: 'inline-block' }}>{JSON.stringify(status)}</pre> : 'loading…'}
        {me ? <span style={{ marginLeft: 12 }}>signed in as {me.email} ({me.role})</span> : null}
      </section>
      {!me && (
        <section style={{ marginBottom: 16, padding: 12, border: '1px solid #1c2638', borderRadius: 8 }}>
          <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 6, marginRight: 6 }} />
          <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 6, marginRight: 6 }} />
          <button onClick={doLogin} style={{ padding: 6, marginRight: 6 }}>Login</button>
          <button onClick={doRegister} style={{ padding: 6 }}>Register</button>
          {msg ? <span style={{ marginLeft: 8 }}>{msg}</span> : null}
        </section>
      )}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {SURFACES.map(([href, title, sub]) => (
          <Link key={href} href={href} style={{ border: '1px solid #1c2638', borderRadius: 10, padding: 14, color: '#e6edf3', textDecoration: 'none' }}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#9fb3c8' }}>{sub}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}
