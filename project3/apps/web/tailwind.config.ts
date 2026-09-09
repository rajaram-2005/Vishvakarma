import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        dim: 'var(--dim)',
        line: 'var(--line)',
        acc: 'var(--acc)',
        acc2: 'var(--acc2)',
        acc3: 'var(--acc3)',
        acc4: 'var(--acc4)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'var(--font-display)',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'ui-monospace', 'SF Mono', 'Cascadia Code', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 60px -12px var(--glow-a)',
        'glow-sm': '0 0 24px -6px var(--glow-a)',
        'glow-cyan': '0 0 32px -8px var(--glow-b)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        dash: {
          to: { strokeDashoffset: '-200' },
        },
        aurora: {
          '0%, 100%': { transform: 'translateX(-8%) translateY(-2%) rotate(-4deg)' },
          '50%': { transform: 'translateX(8%) translateY(2%) rotate(4deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        float: 'float 7s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3.2s ease-in-out infinite',
        'spin-slow': 'spin-slow 26s linear infinite',
        dash: 'dash 6s linear infinite',
        aurora: 'aurora 18s ease-in-out infinite',
        shimmer: 'shimmer 5s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
