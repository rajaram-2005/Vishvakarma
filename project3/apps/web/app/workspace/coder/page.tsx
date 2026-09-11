'use client';
// Lumen Coder — one primary coding experience.
// Roles (planner → architect → implementer → tester → debugger → reviewer →
// security checker) are one pipeline. Terminal execution is real and
// sandboxed with confirmation for anything beyond read-only commands.

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ChevronRight, Code2, ExternalLink, File, FileCode2,
  Folder, Play, Plus, RefreshCw, Save, ShieldCheck, Terminal as TerminalIcon,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { lintFiles, planProject, securityReview, type CoderFile, type LintIssue } from '@/lib/coder/engine';
import { useSutra } from '@/lib/store';
import { uid } from '@sutra/shared';

interface Project {
  id: string; name: string; createdAt: string; files: CoderFile[]; request: string;
}
interface TerminalRun { id: string; command: string; output: string; status: 'ok' | 'error' | 'confirm' | 'running'; token?: string }

const KEY = 'lumen:coder:v1';
function loadProjects(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Project[];
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function saveProjects(projects: Project[]) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(projects.slice(0, 50)));
}

const READONLY_SUGGESTIONS = [
  { label: 'list files', cmd: 'pwd && ls -la' },
  { label: 'node version', cmd: 'node --version' },
  { label: 'git status (repo root)', cmd: 'git -C ../.. status --short | head -20' },
];

export default function CoderPage() {
  const { act } = useSutra();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [request, setRequest] = useState('');
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [edited, setEdited] = useState('');
  const [dirty, setDirty] = useState(false);
  const [runs, setRuns] = useState<TerminalRun[]>([]);
  const [terminalCmd, setTerminalCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ps = loadProjects();
    setProjects(ps);
    if (ps.length > 0) { setActiveId(ps[0].id); setOpenFile(ps[0].files[0]?.path ?? null); }
  }, []);

  const active = projects.find((p) => p.id === activeId) ?? null;
  const file = active?.files.find((f) => f.path === openFile) ?? null;

  useEffect(() => { if (file) { setEdited(file.content); setDirty(false); } }, [file?.path]);

  const scaffold = () => {
    if (!request.trim()) return;
    const plan = planProject(request);
    if (plan.kind === 'unknown') { setError(plan.summary); return; }
    const project: Project = { id: uid('proj'), name: plan.name, createdAt: new Date().toISOString(), files: plan.files, request };
    const next = [project, ...projects];
    setProjects(next); saveProjects(next);
    setActiveId(project.id); setOpenFile(plan.files[0]?.path ?? null);
    act('coder', 'scaffolded', plan.name, undefined);
    setRequest(''); setError(null);
  };

  const saveFile = () => {
    if (!active || !openFile) return;
    const next = projects.map((p) => p.id === active.id ? { ...p, files: p.files.map((f) => (f.path === openFile ? { ...f, content: edited } : f)) } : p);
    setProjects(next); saveProjects(next);
    setDirty(false);
    act('coder', 'file saved', openFile, undefined);
  };

  const runTerminal = async (command: string, confirmationToken?: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/terminal', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, confirmationToken }),
      });
      const j = await res.json();
      if (res.status === 202 && j.confirmation) {
        setRuns((r) => [{ id: uid('t'), command, output: j.confirmation.message ?? 'confirmation required', status: 'confirm', token: j.confirmation.token }, ...r]);
        return;
      }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setRuns((r) => [{ id: uid('t'), command, output: j.output ?? JSON.stringify(j), status: 'ok' }, ...r]);
    } catch (e) {
      setRuns((r) => [{ id: uid('t'), command, output: String((e as Error).message ?? e), status: 'error' }, ...r]);
    } finally {
      setBusy(false);
    }
  };

  const lint = useMemo(() => (active ? lintFiles(active.files) : []), [active?.files]);
  const review = useMemo(() => (active ? securityReview(active.files) : []), [active?.files]);
  const previewable = active?.files.some((f) => f.path === 'index.html');

  return (
    <div className="space-y-5">
      <div>
        <div className="overline mb-2">coder</div>
        <div className="display-1">Build it here<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          One Coder: understand → plan → scaffold → edit → lint → security review → run → ship. Describe what you want in plain language.
        </div>
      </div>

      {error && (
        <div className="glass p-3 font-mono text-[11px]" style={{ color: 'var(--warn)', borderColor: 'color-mix(in srgb, var(--warn) 40%, var(--line))' }}>
          ⚠ {error}
        </div>
      )}

      <GlassPanel className="p-4">
        <div className="pill-input">
          <Code2 size={14} style={{ color: 'var(--dim)' }} />
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scaffold()}
            placeholder="describe the project — e.g. build a React app called Solar Monitor, or a website for my engineering project"
          />
          <button onClick={scaffold} disabled={!request.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: request.trim() ? 1 : 0.5 }}>
            <Plus size={14} /> scaffold
          </button>
        </div>
      </GlassPanel>

      {!active ? (
        <GlassPanel className="p-8 text-center">
          <FileCode2 size={26} style={{ color: 'var(--dim)', margin: '0 auto 8px' }} />
          <div className="text-sm" style={{ color: 'var(--dim)' }}>No projects yet. Describe one above — the Coder plans, scaffolds, lints and reviews it.</div>
        </GlassPanel>
      ) : (
        <div className="grid lg:grid-cols-[230px_1fr] gap-4">
          {/* explorer */}
          <GlassPanel className="p-3 space-y-2">
            <div className="font-mono text-[9px] tracking-widest px-1" style={{ color: 'var(--dim)' }}>PROJECTS</div>
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {projects.map((p) => (
                <button key={p.id} onClick={() => { setActiveId(p.id); setOpenFile(p.files[0]?.path ?? null); }} className="w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors" style={{ background: p.id === activeId ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent', color: p.id === activeId ? 'var(--ink)' : 'var(--dim)' }}>
                  <span className="flex items-center gap-1.5"><Folder size={11} /> <span className="truncate">{p.name}</span></span>
                </button>
              ))}
            </div>
            <div className="font-mono text-[9px] tracking-widest px-1 pt-2" style={{ color: 'var(--dim)' }}>FILES · {active.name.toUpperCase()}</div>
            <div className="space-y-0.5">
              {active.files.map((f) => (
                <button key={f.path} onClick={() => { setOpenFile(f.path); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5" style={{ background: f.path === openFile ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'transparent', color: f.path === openFile ? 'var(--acc2)' : 'var(--dim)' }}>
                  <ChevronRight size={10} style={{ transform: f.path === openFile ? 'rotate(90deg)' : 'none' }} /> <File size={10} /> <span className="truncate">{f.path}</span>
                </button>
              ))}
            </div>
            <div className="font-mono text-[9px] tracking-widest px-1 pt-2" style={{ color: 'var(--dim)' }}>LINT · {lint.filter((l) => l.level !== 'info').length} findings</div>
            <div className="space-y-1">
              {lint.slice(0, 8).map((l, i) => (
                <div key={i} className="text-[10px] font-mono px-2 leading-relaxed" style={{ color: l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--warn)' : 'var(--dim)' }}>
                  {l.level === 'error' ? '✕' : l.level === 'warn' ? '△' : '✓'} {l.file}:{l.line} — {l.message}
                </div>
              ))}
            </div>
            <div className="font-mono text-[9px] tracking-widest px-1 pt-2" style={{ color: 'var(--dim)' }}>SECURITY REVIEW</div>
            <div className="space-y-1">
              {review.map((r) => (
                <div key={r.file} className="text-[10px] font-mono px-2 flex items-center gap-1.5" style={{ color: r.verdict === 'ok' ? 'var(--ok)' : 'var(--warn)' }}>
                  <ShieldCheck size={10} /> {r.file} — {r.verdict}
                </div>
              ))}
            </div>
          </GlassPanel>

          {/* editor + terminal */}
          <div className="space-y-4 min-w-0">
            <GlassPanel className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] tracking-widest flex items-center gap-2" style={{ color: 'var(--acc2)' }}>
                  <FileCode2 size={12} /> {file?.path ?? 'no file open'}
                  {dirty && <span className="chip !text-[8px]" style={{ color: 'var(--warn)' }}>unsaved</span>}
                </div>
                <div className="flex gap-2">
                  {previewable && (
                    <button onClick={() => {
                      const html = active.files.find((f) => f.path === 'index.html')?.content ?? '';
                      const w = window.open('', '_blank');
                      if (w) { w.document.write(html); w.document.close(); }
                    }} className="btn-ghost !py-1.5 !px-3 text-xs">
                      <ExternalLink size={11} /> preview
                    </button>
                  )}
                  <button onClick={saveFile} disabled={!dirty} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-40">
                    <Save size={11} /> save
                  </button>
                </div>
              </div>
              <textarea
                value={edited}
                onChange={(e) => { setEdited(e.target.value); setDirty(true); }}
                spellCheck={false}
                className="console w-full min-h-[380px] p-4 text-[12px] font-mono leading-relaxed outline-none resize-y"
                style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', color: 'var(--ink)' }}
              />
            </GlassPanel>

            <GlassPanel className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] tracking-widest flex items-center gap-2" style={{ color: 'var(--acc2)' }}>
                  <TerminalIcon size={12} /> TERMINAL · SANDBOXED
                </div>
                <span className="chip !text-[8px]" style={{ color: 'var(--warn)' }}>
                  read-only commands run directly · writes require your confirmation
                </span>
              </div>
              <div className="space-y-1.5 mb-2 max-h-[180px] overflow-y-auto">
                {runs.slice(0, 10).map((r) => (
                  <div key={r.id} className="text-[11px] font-mono">
                    <div className="flex items-center gap-2" style={{ color: 'var(--acc2)' }}>
                      <span>$</span> {r.command}
                      {r.status === 'confirm' && (
                        <button onClick={() => void runTerminal(r.command, r.token)} className="chip hover:opacity-100 !text-[9px]" style={{ color: 'var(--warn)' }}>
                          <AlertTriangle size={9} /> approve & run
                        </button>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap mt-0.5" style={{ color: r.status === 'error' ? 'var(--bad)' : r.status === 'confirm' ? 'var(--warn)' : 'var(--dim)' }}>{r.output.slice(0, 1200)}</pre>
                  </div>
                ))}
                {runs.length === 0 && (
                  <div className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
                    Try: {READONLY_SUGGESTIONS.map((s) => s.label).join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {READONLY_SUGGESTIONS.map((s) => (
                  <button key={s.label} onClick={() => setTerminalCmd(s.cmd)} className="chip hover:opacity-100 !text-[9px]">{s.label}</button>
                ))}
              </div>
              <div className="pill-input">
                <TerminalIcon size={13} style={{ color: 'var(--dim)' }} />
                <input value={terminalCmd} onChange={(e) => setTerminalCmd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void runTerminal(terminalCmd)} placeholder="command…" className="font-mono text-xs" />
                <button onClick={() => void runTerminal(terminalCmd)} disabled={busy || !terminalCmd.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: busy || !terminalCmd.trim() ? 0.5 : 1 }}>
                  {busy ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                </button>
              </div>
              <div className="text-[9px] font-mono mt-2" style={{ color: 'var(--dim)' }}>
                commands run server-side in a sandbox · installs, builds and writes are high-risk and always ask first · nothing runs silently
              </div>
            </GlassPanel>
          </div>
        </div>
      )}
    </div>
  );
}
