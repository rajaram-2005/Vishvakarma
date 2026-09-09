// SUTRA mobile theme — the same universe, tuned for a phone.
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
  danger: '#fb7185',
  ok: '#34d399',
  warn: '#fbbf24',
  risk: {
    low: T.ok as string,
    medium: T.warn as string,
    high: '#f97316' as string,
    critical: T.danger as string,
  },
};
