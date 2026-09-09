'use client';
// SUTRA — Puter status hook. Puter is an OPTIONAL layer:
// the app works fully in local mode; connecting is the user's choice.

import { useCallback, useEffect, useState } from 'react';
import { connectPuter, disconnectPuter, puterSignedIn, puterUser } from '@sutra/puter-adapter';

export interface PuterStatus {
  scriptLoaded: boolean;
  signedIn: boolean;
  user: string | null;
  connect: () => Promise<{ ok: boolean; user?: string }>;
  disconnect: () => Promise<void>;
}

export function usePuter(): PuterStatus {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const p = (window as unknown as { puter?: { auth?: { isSignedIn?: () => boolean } } }).puter;
      setScriptLoaded(!!p);
      const ok = p?.auth?.isSignedIn?.() ?? false;
      setSignedIn(ok);
      if (ok) void puterUser().then(setUser);
    };
    check();
    const iv = window.setInterval(check, 2500);
    return () => window.clearInterval(iv);
  }, []);

  const connect = useCallback(async () => {
    const r = await connectPuter();
    setSignedIn(r.ok);
    setUser(r.user ?? null);
    return r;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectPuter();
    setSignedIn(false);
    setUser(null);
  }, []);

  return { scriptLoaded, signedIn, user, connect, disconnect };
}
