'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function MarketplacePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    studioClient.marketplace().then(setData);
  }, []);
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Marketplace — Trust</h1>
      <pre>{data ? JSON.stringify(data, null, 2) : 'loading…'}</pre>
    </main>
  );
}
