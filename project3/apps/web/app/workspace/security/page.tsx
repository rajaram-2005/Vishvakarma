'use client';
// SUTRA — Security: policy matrix, live approvals, secret scan, audit.

import React, { useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, RiskBadge } from '@/components/ui';
import { ApprovalQueue } from '@/components/workspace/IDE';
import { DEFAULT_POLICY, scanForSecrets, assess } from '@sutra/shared';

const SAMPLE_SCAN = `const key = "sk-1234567890abcdefgh1234";
git config token "ghp_ABCDEF1234567890abcdefgh"
password = "hunter2secret"`;

export default function SecurityPage() {
  const { s, resolveApproval, mutate } = useSutra();
  const [scan, setScan] = useState('');
  const [scanOut, setScanOut] = useState<Array<{ line: number; kind: string }>>([]);
  const [cmd, setCmd] = useState('');
  const [cmdRisk, setCmdRisk] = useState<ReturnType<typeof assess> | null>(null);

  const pending = s.approvals.filter((a) => a.status === 'pending');
  const session = s.sessionAllowed;

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="security"
        title="Agent → Gateway → Policy → Sandbox → Execution."
        sub="Risk is classified with reasons; anything dangerous is routed to a human. Nothing runs silently — ever."
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassPanel className="p-5">
          <div className="font-mono text-[10px] tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--acc2)' }}>
            <ShieldCheck size={12} /> APPROVAL QUEUE {pending.length > 0 && <span className="risk-high chip !text-[9px]">{pending.length} pending</span>}
          </div>
          <ApprovalQueue onResolve={resolveApproval} />
          {session.length > 0 && (
            <div className="mt-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>SESSION GRANTS (expire on close)</div>
              <div className="flex flex-wrap gap-2">
                {session.map((c) => (
                  <span key={c} className="chip" style={{ color: 'var(--ok)' }}>{c}</span>
                ))}
                <button
                  onClick={() => mutate((st) => ({ ...st, sessionAllowed: [] }))}
                  className="chip"
                  style={{ cursor: 'pointer', color: 'var(--warn)' }}
                >
                  <Trash2 size={9} /> clear all
                </button>
              </div>
            </div>
          )}
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>COMMAND RISK SCAN</div>
            <input
              value={cmd}
              onChange={(e) => {
                setCmd(e.target.value);
                setCmdRisk(e.target.value ? assess('terminal.exec', e.target.value) : null);
              }}
              placeholder='e.g.  rm -rf /  ·  git push --force  ·  npm test'
              className="glass-2 w-full px-4 py-3 font-mono text-xs outline-none"
              style={{ color: 'var(--ink)' }}
              spellCheck={false}
            />
            {cmdRisk && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <RiskBadge risk={cmdRisk.risk} />
                  <span className="text-xs" style={{ color: cmdRisk.requiresApproval ? 'var(--warn)' : 'var(--ok)' }}>
                    {cmdRisk.requiresApproval ? 'will request approval' : 'allowed by policy'}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5">
                  {cmdRisk.reasons.map((r) => (
                    <div key={r} className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>· {r}</div>
                  ))}
                </div>
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>SECRET SCAN</div>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setScan(SAMPLE_SCAN)} className="btn-ghost !py-1.5 !px-3 text-[10px]">load sample</button>
              <button
                onClick={() => setScanOut(scanForSecrets(scan).map((f) => ({ line: f.line, kind: f.kind })))}
                disabled={!scan.trim()}
                className="btn-primary !py-1.5 !px-3 text-[10px]"
                style={{ opacity: scan.trim() ? 1 : 0.4 }}
              >
                scan
              </button>
            </div>
            <textarea
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              rows={3}
              placeholder="paste code/config to scan for secret patterns…"
              className="glass-2 w-full px-3 py-2 font-mono text-[11px] outline-none resize-none"
              style={{ color: 'var(--ink)' }}
              spellCheck={false}
            />
            {scanOut.length > 0 && (
              <div className="mt-2 space-y-1">
                {scanOut.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-[10.5px]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bad)', boxShadow: '0 0 8px var(--bad)' }} />
                    <span style={{ color: 'var(--bad)' }}>line {f.line}: {f.kind}</span>
                  </div>
                ))}
                <div className="text-[10px] mt-1" style={{ color: 'var(--dim)' }}>the secret values themselves are never echoed back — only location and kind.</div>
              </div>
            )}
            {scanOut.length === 0 && scan.trim() && <div className="mt-2 font-mono text-[10.5px]" style={{ color: 'var(--ok)' }}>clean — no known secret patterns</div>}
          </GlassPanel>
        </div>
      </div>

      <GlassPanel className="overflow-x-auto">
        <div className="px-5 pt-4 font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>POLICY MATRIX</div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--dim)' }}>
              <th className="text-left px-5 py-3">CATEGORY</th>
              <th className="text-left px-5 py-3">BASELINE RISK</th>
              <th className="text-left px-5 py-3">APPROVAL</th>
              <th className="text-left px-5 py-3">NOTES</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_POLICY.map((p) => (
              <tr key={p.category} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="px-5 py-2.5 font-mono text-xs">{p.category}</td>
                <td className="px-5 py-2.5"><RiskBadge risk={p.risk} /></td>
                <td className="px-5 py-2.5 text-xs" style={{ color: p.requiresApproval ? 'var(--warn)' : 'var(--ok)' }}>
                  {p.requiresApproval ? 'required' : 'not required'}
                </td>
                <td className="px-5 py-2.5 text-xs" style={{ color: 'var(--dim)' }}>
                  {p.category === 'terminal.exec' && 'dangerous signatures escalate to critical automatically'}
                  {p.category === 'deploy' && 'always human-gated; pre-deploy secret scan'}
                  {p.category === 'git.push' && 'force-push is critical'}
                  {p.category === 'secret.read' && 'mask + isolate; access is itself an audit event'}
                  {p.category === 'fs.delete' && 'recursive deletes always gated'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
