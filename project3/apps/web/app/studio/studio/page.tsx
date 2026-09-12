'use client';

import { useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function StudioPageSurface() {
  const [prompt, setPrompt] = useState('Generate a brand concept for a solar EV startup');
  const [out, setOut] = useState<{ completed: string[]; failed: string[] } | null>(null);

  async function run() {
    const r = await studioClient.studio(prompt);
    setOut(r);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Studio</h1>
      <p>Creative / generation prompt that runs through the ONE CORE.</p>
      <section>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ width: '70%', minHeight: 80, padding: 8 }} />
        <div>
          <button onClick={run} style={{ padding: 8, marginTop: 8 }}>Generate</button>
        </div>
        {out ? (
          <section>
            <h3>Completed</h3>
            <ul>{out.completed.map((n) => <li key={n}>{n}</li>)}</ul>
            {out.failed.length > 0 && <p>Failed: {out.failed.join(', ')}</p>}
          </section>
        ) : (
          <p>not run yet</p>
        )}
      </section>
    </main>
  );
}
