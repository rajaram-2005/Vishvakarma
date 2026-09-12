'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function StudioPage() {
  const [status, setStatus] = useState<Record<string, number> | null>(null);
  const [text, setText] = useState('Research solar EV charging');
  const [chatOut, setChatOut] = useState<string>('');
  const [library, setLibrary] = useState<Array<{ id: string; title: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [wfOut, setWfOut] = useState<string>('');

  useEffect(() => {
    studioClient.status().then(setStatus);
    studioClient.library().then(setLibrary);
    studioClient.workflowTemplates().then(setTemplates);
  }, []);

  async function sendChat() {
    const r = await studioClient.chat(text);
    setChatOut(JSON.stringify(r, null, 2));
  }
  async function runWf() {
    const r = await studioClient.runWorkflow(templates[0]?.id ?? 'research-report');
    setWfOut(JSON.stringify(r, null, 2));
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Unified AI Studio — ONE CORE</h1>
      <section style={{ marginBottom: 24 }}>
        <h2>Status</h2>
        <pre>{status ? JSON.stringify(status, null, 2) : 'loading…'}</pre>
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2>Chat (universal entry)</h2>
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: '60%', padding: 8 }} />
        <button onClick={sendChat} style={{ padding: 8, marginLeft: 8 }}>Send</button>
        <pre>{chatOut}</pre>
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2>Library ({library.length})</h2>
        <ul>{library.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2>Workflows</h2>
        <button onClick={runWf}>Run {templates[0]?.name ?? 'template'}</button>
        <pre>{wfOut}</pre>
      </section>
    </main>
  );
}
