'use client';

import { useState } from 'react';
import { studioClient, type StudioNode } from '@/lib/studio-client';

function NodeList({ nodes }: { nodes: StudioNode[] }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id} style={{ marginBottom: 8 }}>
          <span
            style={{
              display: 'inline-block',
              minWidth: 90,
              padding: '2px 6px',
              borderRadius: 6,
              background: n.status === 'completed' ? '#16351f' : n.status === 'failed' ? '#3a1d1d' : '#2a2f3a',
              color: n.status === 'completed' ? '#7ee2a0' : n.status === 'failed' ? '#ff9b9b' : '#cdd6e0',
              marginRight: 8,
            }}
          >
            {n.status}
          </span>
          <strong>{n.name}</strong>
          {n.result != null && <pre style={{ margin: '4px 0 0 98px', fontSize: 12, color: '#9fb3c8' }}>{String(n.result)}</pre>}
        </li>
      ))}
    </ul>
  );
}

export default function StudioPageSurface() {
  const [prompt, setPrompt] = useState('Generate a brand concept for a solar EV startup');
  const [nodes, setNodes] = useState<StudioNode[] | null>(null);

  async function run() {
    const r = await studioClient.studio(prompt);
    setNodes(r.nodes);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Studio</h1>
      <p>Creative / generation prompt that runs through the ONE CORE (each step traced below).</p>
      <section>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ width: '70%', minHeight: 80, padding: 8 }} />
        <div>
          <button onClick={run} style={{ padding: 8, marginTop: 8 }}>Generate</button>
        </div>
        {nodes ? <NodeList nodes={nodes} /> : <p>not run yet</p>}
      </section>
    </main>
  );
}
