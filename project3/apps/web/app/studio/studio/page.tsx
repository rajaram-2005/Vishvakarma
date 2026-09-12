'use client';

import { useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function StudioPageSurface() {
  const [prompt, setPrompt] = useState('Generate a brand concept for a solar EV startup');
  const [out, setOut] = useState('');

  async function run() {
    const r = await studioClient.studio(prompt);
    setOut(JSON.stringify(r, null, 2));
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
        <pre>{out || 'not run yet'}</pre>
      </section>
    </main>
  );
}
