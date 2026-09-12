import Link from 'next/link';
import {
  ArrowRight, Bot, Calendar, Code2, Library as LibraryIcon, MessageSquare,
  Package, Palette, Sparkles,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';

// Lumen Studio — the landing page. One product, one story.

const AREAS = [
  { icon: MessageSquare, name: 'Chat', sub: 'One chat, every model — questions, research, code, images, documents, plans. It routes itself to the right capability.' },
  { icon: Palette, name: 'Studio', sub: 'Images, video, audio, documents and apps — created here, saved to the Library, reusable anywhere.' },
  { icon: Code2, name: 'Coder', sub: 'Describe software in plain language. One Coder plans, scaffolds, lints, reviews and ships it.' },
  { icon: LibraryIcon, name: 'Library', sub: 'Chats, projects, media, knowledge and memory — one searchable, collection-based workspace.' },
  { icon: Package, name: 'Plugins', sub: 'A growing plugin store plus any MCP server, with declared permissions and honest trust info.' },
  { icon: Calendar, name: 'Schedules', sub: '“Every morning at 8 am summarize AI news” — real recurring AI work, not alarms.' },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <div className="grid-floor absolute inset-x-0 top-0 h-[160vh] -z-10" />
      <div className="aurora-layer" />

      {/* nav */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 65%, transparent)', backdropFilter: 'blur(18px)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-5 py-3">
          <svg width="24" height="24" viewBox="0 0 26 26" className="shrink-0">
            <polygon points="13,2 23,8 23,18 13,24 3,18 3,8" fill="none" stroke="url(#lg)" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="3.2" fill="url(#lg)" />
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--acc)" />
                <stop offset="1" stopColor="var(--acc2)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-display font-semibold tracking-[0.3em] text-sm">{BRAND.name.toUpperCase()}</span>
          <div className="flex-1" />
          <a href="#areas" className="text-xs hidden sm:block" style={{ color: 'var(--dim)' }}>the studio</a>
          <Link href="/workspace/chat" className="btn-primary !py-2 !px-4 text-xs">
            enter <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative max-w-5xl mx-auto px-5 pt-20 pb-16 text-center">
        <div className="font-mono text-[10px] tracking-[0.5em] mb-4" style={{ color: 'var(--acc2)' }}>
          {BRAND.product.toUpperCase()}
        </div>
        <h1 className="display-1 !text-5xl md:!text-6xl mb-5">
          {BRAND.tagline}
        </h1>
        <p className="text-base max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--dim)' }}>
          One AI Studio that brings together the world&apos;s models, agents, coding, creative tools,
          plugins, MCP servers, workflows, schedules, knowledge and files — inside one unified interface.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/workspace/chat" className="btn-primary !px-6 !py-3">
            <Sparkles size={15} /> open {BRAND.name}
          </Link>
          <a href="#areas" className="btn-ghost !px-6 !py-3 text-sm">
            explore <ArrowRight size={14} />
          </a>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2 font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
          <span className="chip">online · full platform</span>
          <span className="chip">offline · chat + local advice</span>
          <span className="chip">no lock-in · bring any endpoint</span>
        </div>
      </section>

      {/* flow */}
      <section className="relative max-w-6xl mx-auto px-5 pb-14">
        <div className="glass-2 rounded-3xl p-6 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-[640px] justify-center font-mono text-[11px]" style={{ color: 'var(--dim)' }}>
            <span className="chip !text-[10px]" style={{ color: 'var(--acc2)' }}>ONE CHAT</span>
            <span>→</span>
            <span className="chip !text-[10px]">MANY MODELS</span>
            <span>→</span>
            <span className="chip !text-[10px]">MANY CAPABILITIES</span>
            <span>→</span>
            <span className="chip !text-[10px]" style={{ color: 'var(--acc2)' }}>ONE WORKSPACE</span>
          </div>
        </div>
      </section>

      {/* the six areas */}
      <section id="areas" className="relative max-w-6xl mx-auto px-5 pb-20">
        <div className="font-mono text-[10px] tracking-[0.4em] mb-2 text-center" style={{ color: 'var(--acc2)' }}>
          SIX AREAS · ONE STUDIO
        </div>
        <h2 className="display-2 text-center mb-8">Everything is one workspace.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AREAS.map((a) => (
            <div key={a.name} className="glass-2 rounded-2xl p-5 transition-all hover:translate-y-[-2px]">
              <span className="grid place-items-center w-9 h-9 rounded-xl mb-3" style={{ background: 'linear-gradient(135deg, var(--acc), var(--acc4))', color: '#fff' }}>
                <a.icon size={15} />
              </span>
              <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>{a.name}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>{a.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* honesty + ecosystem */}
      <section className="relative max-w-4xl mx-auto px-5 pb-20">
        <div className="glass-2 rounded-2xl p-6">
          <div className="font-mono text-[10px] tracking-[0.4em] mb-3" style={{ color: 'var(--acc2)' }}>
            HONEST BY DESIGN
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
            <li>· online is the full platform; offline is intentionally limited to chat and local advice.</li>
            <li>· every answer says which model produced it and whether data left your machine.</li>
            <li>· model discovery from Hugging Face, GitHub and the Puter gateway is live — and licenses are shown, never assumed.</li>
            <li>· plugins and MCP declare permissions before they run; nothing gets unrestricted access by default.</li>
            <li>· terminal execution is sandboxed; writes, installs and deploys always ask first.</li>
            <li>· bring your own endpoints — OpenAI-compatible, Ollama, vLLM, MLX, ONNX, TensorRT-LLM. No lock-in.</li>
          </ul>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-4 px-5 py-6">
          <span className="font-display tracking-[0.3em] text-xs" style={{ color: 'var(--acc2)' }}>{BRAND.name.toUpperCase()}</span>
          <span className="text-xs" style={{ color: 'var(--dim)' }}>{BRAND.sub}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
            <Bot size={11} /> one chat
            <span>·</span>
            <Palette size={11} /> one studio
            <span>·</span>
            <Code2 size={11} /> one coder
            <span>·</span>
            <LibraryIcon size={11} /> one library
            <span>·</span>
            <Package size={11} /> one ecosystem
          </div>
        </div>
      </footer>
    </main>
  );
}
