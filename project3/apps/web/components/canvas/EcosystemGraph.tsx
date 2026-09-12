'use client';
// Lumen — the ecosystem: one central node, fourteen orbits,
// animated energy trails and travelling light packets.

import React, { useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const NODES = [
  { id: 'github', label: 'GitHub', x: 130, y: 150, h: 2, desc: 'Repos, analysis, PRs, Actions' },
  { id: 'hf', label: 'Hugging Face', x: 870, y: 140, h: 3, desc: 'Models & datasets hub' },
  { id: 'mcp', label: 'MCP', x: 105, y: 330, h: 1, desc: 'Model Context Protocol servers' },
  { id: 'n8n', label: 'n8n', x: 895, y: 330, h: 2, desc: 'Automation bridge (adapter)' },
  { id: 'models', label: 'Models', x: 220, y: 60, h: 0, desc: 'Runtime-neutral model layer' },
  { id: 'agents', label: 'Agents', x: 500, y: 40, h: 1, desc: 'Looping specialists with tools' },
  { id: 'skills', label: 'Skills', x: 780, y: 60, h: 2, desc: 'Capability modules — the HOW' },
  { id: 'memory', label: 'Memory', x: 60, y: 470, h: 3, desc: 'Persistent context — the WHAT' },
  { id: 'rag', label: 'RAG', x: 240, y: 560, h: 0, desc: 'Grounded retrieval + citations' },
  { id: 'tools', label: 'Tools', x: 500, y: 590, h: 1, desc: 'The full arsenal' },
  { id: 'security', label: 'Security', x: 760, y: 560, h: 2, desc: 'Gateway · policy · sandbox' },
  { id: 'evaluation', label: 'Evaluation', x: 940, y: 470, h: 3, desc: 'Measure everything' },
  { id: 'deployment', label: 'Deployment', x: 945, y: 190, h: 0, desc: 'Local · Docker · Puter cloud' },
  { id: 'marketplace', label: 'Marketplace', x: 55, y: 210, h: 1, desc: 'Capability registry' },
];

const HUES = [
  [139, 92, 246],
  [34, 211, 238],
  [232, 121, 249],
  [96, 165, 250],
];

export function EcosystemGraph({ onNodeClick }: { onNodeClick?: (id: string) => void }) {
  const rm = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const CX = 500;
  const CY = 320;

  return (
    <div className="relative w-full" style={{ aspectRatio: '1000/640' }}>
      <svg viewBox="0 0 1000 640" className="w-full h-full" role="img" aria-label="Lumen ecosystem map">
        <defs>
          <radialGradient id="ec-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(235,230,255,0.95)" />
            <stop offset="30%" stopColor="rgba(160,120,255,0.75)" />
            <stop offset="70%" stopColor="rgba(110,70,235,0.25)" />
            <stop offset="100%" stopColor="rgba(60,40,150,0)" />
          </radialGradient>
          {HUES.map((c, i) => (
            <linearGradient key={i} id={`ec-trail-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={`rgba(${c[0]},${c[1]},${c[2]},0.7)`} />
              <stop offset="100%" stopColor={`rgba(${c[0]},${c[1]},${c[2]},0.06)`} />
            </linearGradient>
          ))}
          <filter id="ec-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* trails */}
        {NODES.map((n) => {
          const mx = (CX + n.x) / 2;
          const my = (CY + n.y) / 2 - 60;
          const d = `M ${CX} ${CY} Q ${mx} ${my} ${n.x} ${n.y}`;
          return (
            <g key={n.id}>
              <path d={d} fill="none" stroke={`url(#ec-trail-${n.h})`} strokeWidth="1.3" strokeDasharray="5 9" className={rm ? '' : 'animate-dash'} style={{ opacity: hover === n.id ? 1 : 0.55 }} />
              {!rm && (
                <circle r="2.6" fill={`rgb(${HUES[n.h].join(',')})`} filter="url(#ec-glow)" opacity="0.95">
                  <animateMotion dur={`${5 + (n.x % 4)}s`} repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          );
        })}

        {/* central Lumen node */}
        <g filter="url(#ec-glow)">
          <circle cx={CX} cy={CY} r="92" fill="url(#ec-core)" className={rm ? '' : 'animate-pulse-soft'} />
          <polygon
            points={hexPoints(CX, CY, 46)}
            fill="rgba(10,10,30,0.75)"
            stroke="rgba(170,140,255,0.8)"
            strokeWidth="1.4"
          />
          <text x={CX} y={CY + 6} textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="15" letterSpacing="4" fill="#efeaff">
            Lumen
          </text>
        </g>

        {/* orbit nodes */}
        {NODES.map((n) => {
          const [r, g, b] = HUES[n.h];
          const active = hover === n.id;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onNodeClick?.(n.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={n.x} cy={n.y} r={active ? 26 : 20} fill={`rgba(${r},${g},${b},${active ? 0.22 : 0.1})`} className={rm ? '' : 'animate-pulse-soft'} />
              <circle cx={n.x} cy={n.y} r="11" fill="rgba(8,9,24,0.9)" stroke={`rgba(${r},${g},${b},0.9)`} strokeWidth="1.3" />
              <circle cx={n.x} cy={n.y} r="3.4" fill={`rgb(${r},${g},${b})`} />
              <text x={n.x} y={n.y + (n.y < CY ? -30 : 36)} textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="11.5" fill={active ? '#efeaff' : 'var(--dim)'} letterSpacing="1.5">
                {n.label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* tooltip */}
      {hover && (
        <div
          className="glass-2 absolute px-4 py-3 text-xs pointer-events-none z-10 max-w-[240px]"
          style={{
            left: `${(NODES.find((n) => n.id === hover)!.x / 1000) * 100}%`,
            top: `${(NODES.find((n) => n.id === hover)!.y / 640) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          <div className="font-mono tracking-widest" style={{ color: 'var(--acc2)' }}>
            {NODES.find((n) => n.id === hover)!.label}
          </div>
          <div style={{ color: 'var(--dim)' }}>{NODES.find((n) => n.id === hover)!.desc}</div>
        </div>
      )}
    </div>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}
