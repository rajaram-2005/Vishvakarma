'use client';
// Lumen — workspace store. Local-first persistence (localStorage),
// trace recording (OpenTelemetry-shaped), approvals and activity.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  ActivityEvent,
  Approval,
  ApprovalDecision,
  Settings,
  Span,
  Trace,
} from '@sutra/shared';
import { uid } from '@sutra/shared';
import { seedState, SEED_VERSION, type AppStateSeed } from './seed';

const LS_KEY = 'sutra:app:v3';
const MAX_TRACES = 200;
const MAX_ACTIVITY = 300;

type AppState = AppStateSeed;

type Action = { type: 'patch'; patch: Partial<AppState> } | { type: 'mutate'; fn: (s: AppState) => AppState };

function reducer(s: AppState, a: Action): AppState {
  if (a.type === 'patch') return { ...s, ...a.patch };
  return a.fn(s);
}

function loadInitial(): AppState {
  // Deterministic initial render. The server render (and the client's first
  // render, which must match it for hydration) always uses the seed; state
  // persisted in localStorage is applied afterwards, in a mount effect. Reading
  // localStorage here would make the client's first render diverge from the
  // server's HTML and blow up hydration.
  return seedState();
}

/** Reads and validates state persisted in localStorage (client-only). */
function readPersistedState(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<AppState>;
    // localStorage is user-editable and older builds may have persisted a
    // partially written state. Never let one bad field bring down the whole
    // client tree: only hydrate states with the collections the UI relies on.
    const collections: Array<keyof AppState> = [
      'models', 'projects', 'conversations', 'agents', 'teams', 'skills', 'tools',
      'workflows', 'approvals', 'activity', 'traces', 'mcp', 'memory', 'knowledge',
      'chunks', 'deployments', 'installed', 'sessionAllowed',
    ];
    if (
      saved.version !== SEED_VERSION ||
      !saved.settings ||
      collections.some((key) => !Array.isArray(saved[key]))
    ) return null;
    const seed = seedState();
    return { ...seed, ...saved, settings: { ...seed.settings, ...saved.settings } } as AppState;
  } catch {
    return null;
  }
}

export interface Tracer {
  id: string;
  span(name: string, durMs: number, attrs?: Record<string, string>, status?: 'ok' | 'error'): void;
  end(status?: 'ok' | 'error'): string;
}

interface StoreValue {
  s: AppState;
  patch: (p: Partial<AppState>) => void;
  mutate: (fn: (s: AppState) => AppState) => void;
  setSettings: (p: Partial<Settings>) => void;
  act: (kind: string, title: string, detail: string, traceId?: string) => string;
  trace: (name: string) => Tracer;
  requestApproval: (a: { source: string; action: string; detail: string; risk: Approval['risk']; reasons: string[] }) => string;
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
  sessionAllow: (category: string) => void;
  exportAll: () => string;
  importAll: (json: string) => boolean;
  resetAll: () => void;
  reducedMotion: boolean;
}

const Ctx = createContext<StoreValue | null>(null);

export function SutraProvider({ children }: { children: React.ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, loadInitial);
  const [reducedMotion, setReducedMotion] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // Hydrate persisted state after the first paint. The seed rendered by the
  // server (and by the client during hydration) is replaced with the state the
  // user actually had in localStorage. Skipping the dispatch entirely when
  // nothing was persisted avoids a pointless re-render.
  useEffect(() => {
    const persisted = readPersistedState();
    if (!persisted) return;
    dispatch({ type: 'patch', patch: persisted });
  }, []);

  // persist (debounced)
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(s));
      } catch {
        /* quota — drop oldest traces and retry once */
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ ...s, traces: s.traces.slice(0, 40), activity: s.activity.slice(0, 80) }));
        } catch {
          /* give up silently; state stays in memory */
        }
      }
    }, 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [s]);

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme;
  }, [s.settings.theme]);

  // reduced motion: system preference + user override
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compute = () => {
      const v = s.settings.reducedMotion;
      setReducedMotion(v === 'on' || (v === 'system' && mq.matches));
    };
    compute();
    mq.addEventListener('change', compute);
    return () => mq.removeEventListener('change', compute);
  }, [s.settings.reducedMotion]);

  const patch = useCallback((p: Partial<AppState>) => dispatch({ type: 'patch', patch: p }), []);
  const mutate = useCallback((fn: (s: AppState) => AppState) => dispatch({ type: 'mutate', fn }), []);

  const setSettings = useCallback(
    (p: Partial<Settings>) =>
      dispatch({
        type: 'mutate',
        fn: (st) => ({
          ...st,
          settings: {
            ...st.settings,
            ...p,
            providers: { ...st.settings.providers, ...(p.providers ?? {}) },
            aetheris: { ...(st.settings.aetheris ?? {}), ...(p.aetheris ?? {}) } as { baseUrl: string },
          },
        }),
      }),
    [],
  );

  const act = useCallback(
    (kind: string, title: string, detail: string, traceId?: string): string => {
      const id = uid('act');
      const ev: ActivityEvent = { id, ts: new Date().toISOString(), kind, title, detail, traceId };
      dispatch({
        type: 'mutate',
        fn: (st) => ({ ...st, activity: [ev, ...st.activity].slice(0, MAX_ACTIVITY) }),
      });
      return id;
    },
    [],
  );

  const trace = useCallback(
    (name: string): Tracer => {
      const id = uid('tr');
      const t0 = Date.now();
      const rel: Array<{ n: string; off: number; dur: number; attrs: Record<string, string>; status: 'ok' | 'error' }> = [];
      let cursor = 0;
      let ended = false;
      return {
        id,
        span(n, durMs, attrs = {}, status = 'ok') {
          rel.push({ n, off: cursor, dur: Math.max(1, Math.round(durMs)), attrs, status });
          cursor += Math.max(1, Math.round(durMs));
        },
        end(status = 'ok') {
          if (ended) return id;
          ended = true;
          const traceStart = Date.now() - cursor;
          const spans: Span[] = rel.map((r) => ({
            id: uid('sp'),
            traceId: id,
            name: r.n,
            kind: 'internal',
            start: traceStart + r.off,
            end: traceStart + r.off + r.dur,
            status: r.status,
            attrs: r.attrs,
          }));
          const tr: Trace = { id, name, start: traceStart, end: traceStart + cursor, status, spans };
          dispatch({
            type: 'mutate',
            fn: (st) => ({ ...st, traces: [tr, ...st.traces].slice(0, MAX_TRACES) }),
          });
          return id;
        },
      };
    },
    [],
  );

  const requestApproval = useCallback(
    (a: { source: string; action: string; detail: string; risk: Approval['risk']; reasons: string[] }): string => {
      const id = uid('ap');
      const ap: Approval = { id, createdAt: new Date().toISOString(), status: 'pending', ...a };
      dispatch({ type: 'mutate', fn: (st) => ({ ...st, approvals: [ap, ...st.approvals].slice(0, 100) }) });
      return id;
    },
    [],
  );

  const resolveApproval = useCallback((id: string, decision: ApprovalDecision) => {
    dispatch({
      type: 'mutate',
      fn: (st) => {
        const ap = st.approvals.find((a) => a.id === id);
        const approved = decision === 'allow-once' || decision === 'allow-session';
        const sessionAllowed =
          approved && decision === 'allow-session' && ap && !st.sessionAllowed.includes(ap.source)
            ? [...st.sessionAllowed, ap.source]
            : st.sessionAllowed;
        return {
          ...st,
          sessionAllowed,
          approvals: st.approvals.map((a) =>
            a.id === id ? { ...a, status: approved ? 'approved' : 'denied', decision } : a,
          ),
        };
      },
    });
  }, []);

  const sessionAllow = useCallback((category: string) => {
    dispatch({
      type: 'mutate',
      fn: (st) => (st.sessionAllowed.includes(category) ? st : { ...st, sessionAllowed: [...st.sessionAllowed, category] }),
    });
  }, []);

  const exportAll = useCallback(() => JSON.stringify(s, null, 2), [s]);

  const importAll = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as AppState;
      if (typeof parsed !== 'object' || !parsed.settings) return false;
      dispatch({ type: 'patch', patch: { ...seedState(), ...parsed } });
      return true;
    } catch {
      return false;
    }
  }, []);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
    dispatch({ type: 'patch', patch: seedState() });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      s,
      patch,
      mutate,
      setSettings,
      act,
      trace,
      requestApproval,
      resolveApproval,
      sessionAllow,
      exportAll,
      importAll,
      resetAll,
      reducedMotion,
    }),
    [s, patch, mutate, setSettings, act, trace, requestApproval, resolveApproval, sessionAllow, exportAll, importAll, resetAll, reducedMotion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSutra(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSutra must be used inside <SutraProvider>');
  return v;
}

/** Resolves whether a category is allowed right now (policy + session grants). */
export function useSessionAllowed(): Set<string> {
  const { s } = useSutra();
  return useMemo(() => new Set(s.sessionAllowed), [s.sessionAllowed]);
}
