'use client';
// Lumen — shared UI primitives. Spatial glass, glow, motion-aware.

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { RiskLevel } from '@sutra/shared';

export function GlassPanel({
  children,
  className = '',
  hover = false,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag className={`glass ${hover ? 'glass-hover cursor-pointer' : ''} ${className}`}>{children}</Tag>
  );
}

export function GlowButton({
  children,
  onClick,
  kind = 'primary',
  className = '',
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'ghost';
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${kind === 'primary' ? 'btn-primary' : 'btn-ghost'} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({ children, tone = 'dim' }: { children: React.ReactNode; tone?: 'dim' | 'acc' | 'acc2' | 'ok' | 'warn' | 'bad' }) {
  const color =
    tone === 'acc' ? 'color:var(--acc);border-color:color-mix(in srgb, var(--acc) 40%, transparent)' :
    tone === 'acc2' ? 'color:var(--acc2);border-color:color-mix(in srgb, var(--acc2) 40%, transparent)' :
    tone === 'ok' ? 'color:var(--ok);border-color:color-mix(in srgb, var(--ok) 40%, transparent)' :
    tone === 'warn' ? 'color:var(--warn);border-color:color-mix(in srgb, var(--warn) 40%, transparent)' :
    tone === 'bad' ? 'color:var(--bad);border-color:color-mix(in srgb, var(--bad) 40%, transparent)' : '';
  return <span className="chip" style={color ? { color: undefined, ...parseColor(color) } : undefined}>{children}</span>;
}

function parseColor(s: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split(':');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out as React.CSSProperties;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`chip risk-${risk}`}>{risk}</span>;
}

export function Stat({ label, value, sub, tone = 'acc' }: { label: string; value: React.ReactNode; sub?: string; tone?: 'acc' | 'acc2' | 'ok' | 'warn' | 'bad' }) {
  const c =
    tone === 'acc2' ? 'var(--acc2)' : tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--acc)';
  return (
    <div className="glass p-4">
      <div className="overline mb-2">{label}</div>
      <div className="font-display text-2xl font-semibold" style={{ color: c }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--dim)' }}>{sub}</div>}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="flex items-center gap-3 group"
      style={{ color: 'var(--ink)' }}
    >
      <span
        className="relative inline-block w-10 h-[22px] rounded-full transition-all"
        style={{
          background: on ? 'linear-gradient(90deg, var(--acc), var(--acc4))' : 'var(--panel-2)',
          border: '1px solid var(--line)',
          boxShadow: on ? '0 0 14px -2px var(--glow-a)' : 'none',
        }}
      >
        <span
          className="absolute top-[2px] w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: on ? 'calc(100% - 18px)' : '2px' }}
        />
      </span>
      {label && <span className="text-sm" style={{ color: on ? 'var(--ink)' : 'var(--dim)' }}>{label}</span>}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const rm = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: rm ? 0 : 0.18 }}
          style={{ background: 'rgba(2,3,10,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: rm ? 0 : 24, scale: rm ? 1 : 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: rm ? 0 : 12, opacity: 0 }}
            transition={{ duration: rm ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`glass-2 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[80vh] overflow-y-auto p-6`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <button onClick={onClose} className="text-2xl leading-none px-2" style={{ color: 'var(--dim)' }} aria-label="close">×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LogConsole({ lines, className = '', maxHeight = 320 }: { lines: string[]; className?: string; maxHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={ref}
      className={`console glass-2 p-4 overflow-y-auto whitespace-pre-wrap break-words ${className}`}
      style={{ maxHeight }}
    >
      {lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : <div style={{ color: 'var(--dim)' }}>— quiet —</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'acc' }: { value: number; tone?: 'acc' | 'acc2' | 'ok' | 'warn' }) {
  const c = tone === 'acc2' ? 'var(--acc2)' : tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--acc)';
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${c}, var(--acc3))`, boxShadow: `0 0 12px ${c}` }}
      />
    </div>
  );
}

export interface Step {
  id: string;
  label: string;
  desc?: string;
}

export function Pipeline({
  steps,
  activeIdx = -1,
  doneUpTo = -1,
  compact,
  onStepClick,
}: {
  steps: Step[];
  activeIdx?: number;
  doneUpTo?: number;
  compact?: boolean;
  onStepClick?: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, i) => {
        const done = i <= doneUpTo;
        const active = i === activeIdx;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <div className="self-center px-0.5" style={{ color: done || active ? 'var(--acc2)' : 'var(--line)' }}>
                <svg width="26" height="10" viewBox="0 0 26 10" fill="none">
                  <path d="M0 5h20m0 0l-4-3.5M20 5l-4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 3" />
                </svg>
              </div>
            )}
            <button
              onClick={onStepClick ? () => onStepClick(i) : undefined}
              className="glass-2 px-3 py-2 text-left transition-all"
              style={{
                borderColor: active ? 'var(--acc2)' : done ? 'color-mix(in srgb, var(--ok) 45%, var(--line))' : 'var(--line)',
                boxShadow: active ? '0 0 24px -6px var(--glow-b)' : 'none',
                minWidth: compact ? 86 : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: active ? 'var(--acc2)' : done ? 'var(--ok)' : 'var(--dim)',
                    boxShadow: active ? '0 0 10px var(--acc2)' : 'none',
                    animation: active ? 'pulse-soft 1.2s ease-in-out infinite' : 'none',
                  }}
                />
                <span className={`font-mono text-[11px] tracking-wide ${compact ? '' : 'text-xs'}`} style={{ color: active || done ? 'var(--ink)' : 'var(--dim)' }}>
                  {s.label}
                </span>
              </div>
              {!compact && s.desc && <div className="text-[10px] mt-1 pl-4" style={{ color: 'var(--dim)' }}>{s.desc}</div>}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function usePipelineRunner(
  steps: Step[],
  onStep: (i: number, step: Step) => Promise<void> | void,
  delayMs = 650,
) {
  const [running, setRunning] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [doneUpTo, setDoneUpTo] = useState(-1);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef(false);

  const run = async (startLog?: string[]) => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setLog(startLog ?? []);
    setDoneUpTo(-1);
    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) break;
      setActiveIdx(i);
      const step = steps[i];
      const t0 = Date.now();
      try {
        await onStep(i, step);
      } catch (e) {
        setLog((l) => [...l, `✗ ${step.label}: ${String((e as Error)?.message ?? e)}`]);
        cancelRef.current = true;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      setDoneUpTo(i);
      setActiveIdx(i + 1);
      void t0;
    }
    setRunning(false);
    setActiveIdx(-1);
  };

  const stop = () => {
    cancelRef.current = true;
  };

  return { running, activeIdx, doneUpTo, log, run, stop, setLog };
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass p-10 text-center">
      <div className="font-display text-lg" style={{ color: 'var(--dim)' }}>{title}</div>
      {hint && <div className="text-sm mt-2" style={{ color: 'var(--dim)' }}>{hint}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'search…'}
      className="glass-2 px-4 py-2 text-sm outline-none w-full"
      style={{ color: 'var(--ink)' }}
    />
  );
}

export function SectionTitle({ overline, title, sub }: { overline: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="overline mb-3">{overline}</div>
      <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">{title}</h2>
      {sub && <p className="mt-3 text-sm max-w-2xl" style={{ color: 'var(--dim)' }}>{sub}</p>}
    </div>
  );
}
