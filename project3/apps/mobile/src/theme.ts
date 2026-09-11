// Aetherion mobile theme — the same universe, tuned for a phone.
const ok = '#34d399';
const warn = '#fbbf24';
const danger = '#fb7185';

export const T = {
  bg: '#050510',
  panel: 'rgba(20, 18, 44, 0.72)',
  panelBorder: 'rgba(140, 120, 255, 0.22)',
  text: '#ece9ff',
  dim: '#8f8ac2',
  purple: '#8b5cf6',
  magenta: '#e879f9',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  danger,
  ok,
  warn,
  risk: {
    low: ok,
    medium: warn,
    high: '#f97316',
    critical: danger,
  },
} as const;
