'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function ModelsPage() {
  const [models, setModels] = useState<Array<{ id: string; name?: string; provider?: string; capabilities?: string[] }>>([]);
  useEffect(() => {
    studioClient.models().then(setModels);
  }, []);
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Models</h1>
      <ul>{models.map((m) => <li key={m.id}>{m.id} {m.provider ? `(${m.provider})` : ''} — {(m.capabilities ?? []).join(', ')}</li>)}</ul>
    </main>
  );
}
