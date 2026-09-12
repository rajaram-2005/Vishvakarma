'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { studioClient } from '@/lib/studio-client';

const LINKS: Array<[string, string]> = [
  ['/studio', 'Home'],
  ['/studio/chat', 'Chat'],
  ['/studio/library', 'Library'],
  ['/studio/models', 'Models'],
  ['/studio/workflows', 'Workflows'],
  ['/studio/schedules', 'Schedules'],
  ['/studio/coder', 'Coder'],
  ['/studio/studio', 'Studio'],
  ['/studio/security', 'Security'],
  ['/studio/activity', 'Activity'],
  ['/studio/marketplace', 'Marketplace'],
];

export function StudioShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    studioClient.me().then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f1a', color: '#e6edf3', fontFamily: 'system-ui' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '10px 18px',
          borderBottom: '1px solid #1c2638',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ letterSpacing: 0.3 }}>Unified AI Studio</strong>
        <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} style={{ color: '#9fb3c8', textDecoration: 'none', fontSize: 13 }}>
              {label}
            </Link>
          ))}
        </nav>
        <span style={{ marginLeft: 'auto', fontSize: 13 }}>
          {me ? (
            <span>
              {me.email} ({me.role}){' '}
              <button
                onClick={() => {
                  studioClient.clearToken();
                  setMe(null);
                }}
                style={{ background: 'transparent', border: '1px solid #1c2638', color: '#9fb3c8', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
              >
                logout
              </button>
            </span>
          ) : (
            <Link href="/studio" style={{ color: '#9fb3c8' }}>
              login
            </Link>
          )}
        </span>
      </header>
      {children}
    </div>
  );
}
