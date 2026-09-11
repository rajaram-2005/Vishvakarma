'use client';
// Aetherion workspace shell — spatial glass navigation.
// Home · Chat · Projects · Agents · Teams · Models · Tools · Skills ·
// Knowledge · Memory · Workflows · MCP · Plugins · Evaluation · Security ·
// Activity · Deployments · Marketplace · Settings

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Brain,
  Cpu,
  Database,
  FolderKanban,
  Gauge,
  Home,
  MessageSquare,
  Orbit,
  Package,
  Plug,
  Puzzle,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Volume2,
  VolumeX,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useSutra } from '@/lib/store';
import { usePuter } from '@/lib/puter';

const NAV: Array<{ href: string; label: string; icon: React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }> }> = [
  { href: '/workspace', label: 'Home', icon: Home },
  { href: '/workspace/chat', label: 'Chat', icon: MessageSquare },
  { href: '/workspace/projects', label: 'Projects', icon: FolderKanban },
  { href: '/workspace/agents', label: 'Agents', icon: Bot },
  { href: '/workspace/teams', label: 'Teams', icon: Users },
  { href: '/workspace/models', label: 'Models', icon: Cpu },
  { href: '/workspace/tools', label: 'Tools', icon: Wrench },
  { href: '/workspace/skills', label: 'Skills', icon: Puzzle },
  { href: '/workspace/knowledge', label: 'Knowledge', icon: Database },
  { href: '/workspace/memory', label: 'Memory', icon: Brain },
  { href: '/workspace/generate', label: 'Generate', icon: Sparkles },
  { href: '/workspace/aetheris', label: 'Aetheris', icon: Orbit },
  { href: '/workspace/workflows', label: 'Workflows', icon: Workflow },
  { href: '/workspace/mcp', label: 'MCP', icon: Plug },
  { href: '/workspace/plugins', label: 'Plugins', icon: Package },
  { href: '/workspace/evaluation', label: 'Evaluation', icon: Gauge },
  { href: '/workspace/security', label: 'Security', icon: ShieldCheck },
  { href: '/workspace/activity', label: 'Activity', icon: Activity },
  { href: '/workspace/deployments', label: 'Deployments', icon: Rocket },
  { href: '/workspace/marketplace', label: 'Marketplace', icon: Store },
  { href: '/workspace/settings', label: 'Settings', icon: Settings },
];

function titleFor(pathname: string): string {
  const cur = NAV.find((n) => (n.href === '/workspace' ? pathname === '/workspace' : pathname.startsWith(n.href)));
  return cur?.label ?? 'Workspace';
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/workspace';
  const { s, setSettings } = useSutra();
  const puter = usePuter();
  const pending = s.approvals.filter((a) => a.status === 'pending').length;
  const themes: Array<'dark' | 'light' | 'aurora'> = ['dark', 'light', 'aurora'];

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* atmospheric background */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(50% 40% at 20% 10%, var(--nebula-1), transparent 70%), radial-gradient(45% 38% at 85% 20%, var(--nebula-2), transparent 70%), radial-gradient(55% 45% at 50% 95%, var(--nebula-3), transparent 72%)',
        }}
      />
      <div className="grid-floor fixed inset-0 -z-10 pointer-events-none" />

      {/* left rail */}
      <aside
        className="hidden md:flex flex-col w-16 lg:w-56 shrink-0 sticky top-0 h-screen p-3 gap-1 border-r overflow-y-auto"
        style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(18px)' }}
      >
        <Link href="/" className="flex items-center gap-2.5 px-2 py-3 mb-2">
          <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
            <polygon points="13,2 23,8 23,18 13,24 3,18 3,8" fill="none" stroke="url(#wl-g)" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="3.2" fill="url(#wl-g)" />
            <defs>
              <linearGradient id="wl-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--acc)" />
                <stop offset="1" stopColor="var(--acc2)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-display font-semibold tracking-[0.3em] text-xs hidden lg:inline">Aetherion</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const active = n.href === '/workspace' ? pathname === '/workspace' : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.label}
                className="relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
                style={{
                  background: active ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                  border: `1px solid ${active ? 'color-mix(in srgb, var(--acc) 35%, transparent)' : 'transparent'}`,
                  boxShadow: active ? '0 0 22px -8px var(--glow-a)' : 'none',
                }}
              >
                <Icon size={16} className="shrink-0" style={{ color: active ? 'var(--acc2)' : 'var(--dim)' }} />
                <span className="text-xs hidden lg:inline" style={{ color: active ? 'var(--ink)' : 'var(--dim)' }}>
                  {n.label}
                </span>
                {n.href === '/workspace/security' && pending > 0 && (
                  <span
                    className="ml-auto hidden lg:flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono"
                    style={{ background: 'var(--bad)', color: '#fff', boxShadow: '0 0 12px var(--bad)' }}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 py-3 hidden lg:block">
          <div className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--dim)' }}>
            {s.settings.privacyMode.toUpperCase()} MODE
            <br />
            <span style={{ color: 'var(--ok)' }}>● local-first</span>
          </div>
        </div>
      </aside>

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className="sticky top-0 z-40 flex items-center gap-3 px-4 md:px-6 py-3 border-b"
          style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 70%, transparent)', backdropFilter: 'blur(18px)' }}
        >
          <div className="font-display font-semibold tracking-wide text-sm">{titleFor(pathname)}</div>
          <span className="chip hidden sm:inline-flex" style={{ color: 'var(--acc2)' }}>
            {s.settings.privacyMode}
          </span>
          <span
            className="chip hidden sm:inline-flex"
            style={{ color: puter.signedIn ? 'var(--ok)' : puter.scriptFailed ? 'var(--warn)' : 'var(--dim)' }}
            title={puter.error ?? undefined}
          >
            puter: {puter.signedIn ? puter.user ?? 'connected' : puter.scriptFailed ? 'blocked · local mode' : 'local mode'}
          </span>
          <div className="flex-1" />
          {pending > 0 && (
            <Link href="/workspace/security" className="chip risk-high !text-[10px]">
              {pending} approval{pending > 1 ? 's' : ''} waiting
            </Link>
          )}
          <button
            onClick={() => setSettings({ ambientSound: !s.settings.ambientSound })}
            title="ambient soundscape (off by default)"
            className="p-2 rounded-lg"
            style={{ color: s.settings.ambientSound ? 'var(--acc2)' : 'var(--dim)' }}
          >
            {s.settings.ambientSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            onClick={() => {
              const i = themes.indexOf(s.settings.theme);
              setSettings({ theme: themes[(i + 1) % themes.length] });
            }}
            title={`theme: ${s.settings.theme} (click to cycle)`}
            className="font-mono text-[10px] tracking-widest px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--dim)', border: '1px solid var(--line)' }}
          >
            {s.settings.theme.toUpperCase()}
          </button>
          <Link href="/" className="font-mono text-[10px] tracking-widest px-3 py-1.5 rounded-lg" style={{ color: 'var(--dim)', border: '1px solid var(--line)' }}>
            EXIT →
          </Link>
        </header>

        {/* mobile bottom nav */}
        <nav
          className="md:hidden sticky bottom-0 z-40 flex overflow-x-auto gap-1 px-2 py-2 border-t"
          style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(14px)' }}
        >
          {NAV.map((n) => {
            const active = n.href === '/workspace' ? pathname === '/workspace' : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg shrink-0"
                style={{ background: active ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent' }}
              >
                <Icon size={15} style={{ color: active ? 'var(--acc2)' : 'var(--dim)' }} />
                <span className="text-[9px] font-mono" style={{ color: active ? 'var(--ink)' : 'var(--dim)' }}>
                  {n.label.slice(0, 8)}
                </span>
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
