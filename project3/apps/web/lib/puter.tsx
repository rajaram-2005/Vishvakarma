'use client';
// Aetherion — Puter status hook. Puter is an OPTIONAL layer:
// the app works fully in local mode; connecting is the user's choice.
// All failure modes (script blocked, popup blocked, storage blocked in
// embedded views) are surfaced as human-readable errors instead of
// failing silently.

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectPuter,
  disconnectPuter,
  listPuterModels,
  puterAiChat,
  puterAiAvailable,
  puterSignedIn,
  puterTxt2Img,
  puterUser,
} from '@sutra/puter-adapter';
import type { PuterAiChatResult, PuterAiModel, PuterConnectResult, PuterImageResult } from '@sutra/puter-adapter';

/** If Puter.js hasn't appeared after this long, report it as failed. */
const SCRIPT_TIMEOUT_MS = 15000;

declare global {
  interface Window {
    /** Set by <PuterScript> when js.puter.com fails to load. */
    __puterScriptFailed?: boolean;
  }
}

/** Loads Puter.js and flags load failures so the hook can report them. */
export function PuterScript() {
  return (
    <Script
      src="https://js.puter.com/v2/"
      strategy="lazyOnload"
      onError={() => {
        window.__puterScriptFailed = true;
      }}
    />
  );
}

export interface PuterStatus {
  scriptLoaded: boolean;
  /** Puter.js never appeared (network filter / content blocker / offline). */
  scriptFailed: boolean;
  signedIn: boolean;
  user: string | null;
  /** A connect/disconnect round-trip is in flight. */
  busy: boolean;
  /** Human-readable failure detail, or null when all is well. */
  error: string | null;
  connect: () => Promise<PuterConnectResult>;
  disconnect: () => Promise<void>;
  dismissError: () => void;
}

export function usePuter(): PuterStatus {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedAt = useRef(0);

  useEffect(() => {
    mountedAt.current = Date.now();
    const check = () => {
      const p = (window as unknown as { puter?: { auth?: { isSignedIn?: () => boolean } } }).puter;
      if (p) {
        // Late arrival after a timeout — clear the failure flag.
        setScriptLoaded(true);
        setScriptFailed(false);
        const ok = p?.auth?.isSignedIn?.() ?? false;
        setSignedIn(ok);
        if (ok) void puterUser().then((u) => u && setUser(u));
      } else if (window.__puterScriptFailed || Date.now() - mountedAt.current > SCRIPT_TIMEOUT_MS) {
        setScriptFailed(true);
      }
    };
    check();
    const iv = window.setInterval(check, 2500);
    return () => window.clearInterval(iv);
  }, []);

  const connect = useCallback(async (): Promise<PuterConnectResult> => {
    setBusy(true);
    setError(null);
    try {
      const r = await connectPuter();
      if (r.ok) {
        setSignedIn(true);
        setUser(r.user ?? null);
      } else {
        setSignedIn(puterSignedIn());
        setError(r.error?.message ?? 'Could not connect to Puter.');
      }
      return r;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectPuter();
    } finally {
      setSignedIn(false);
      setUser(null);
      setBusy(false);
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { scriptLoaded, scriptFailed, signedIn, user, busy, error, connect, disconnect, dismissError };
}

/* ─────────────────────── Puter AI gateway (hook) ─────────────────────── */

export interface PuterAiStatus {
  /** The gateway is usable right now (Puter.js loaded + signed in). */
  available: boolean;
  /** Gateway models, loaded on demand when signed in. */
  models: PuterAiModel[] | null;
  loadingModels: boolean;
  modelsError: string | null;
  busy: boolean;
  loadModels: () => Promise<PuterAiModel[]>;
  chat: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ) => Promise<PuterAiChatResult | null>;
  image: (prompt: string, options?: { width?: number; height?: number }) => Promise<PuterImageResult | null>;
}

export function usePuterAi(): PuterAiStatus {
  const [available, setAvailable] = useState(false);
  const [models, setModels] = useState<PuterAiModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => setAvailable(puterAiAvailable());
    check();
    const iv = window.setInterval(check, 3000);
    return () => window.clearInterval(iv);
  }, []);

  const loadModels = useCallback(async (): Promise<PuterAiModel[]> => {
    if (!puterAiAvailable()) return [];
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await listPuterModels();
      setModels(list.length ? list : null);
      if (list.length === 0) setModelsError('No models reported by the gateway.');
      return list;
    } catch {
      setModelsError('Could not list gateway models.');
      return [];
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const chat = useCallback(
    async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: { model?: string; temperature?: number; maxTokens?: number }) => {
      if (!puterAiAvailable()) return null;
      setBusy(true);
      try {
        return await puterAiChat(messages, options);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const image = useCallback(async (prompt: string, options?: { width?: number; height?: number }) => {
    if (!puterAiAvailable()) return null;
    setBusy(true);
    try {
      return await puterTxt2Img(prompt, options);
    } finally {
      setBusy(false);
    }
  }, []);

  return { available, models, loadingModels, modelsError, busy, loadModels, chat, image };
}
