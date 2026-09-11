import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SutraProvider } from '@/lib/store';
import { AmbientController } from '@/lib/AmbientController';
import { PuterScript } from '@/lib/puter';

export const metadata: Metadata = {
  title: 'SUTRA — The Open AI Ecosystem',
  description:
    'Models. Agents. Tools. Knowledge. Workflows. Local AI. One workspace to build, automate, evaluate, and deploy AI systems. Local-first, provider-neutral, cinematic.',
  keywords: ['AI workspace', 'local-first', 'agents', 'models', 'RAG', 'MCP', 'n8n', 'SUTRA'],
  openGraph: {
    title: 'SUTRA — Build the Open AI Ecosystem',
    description: 'One workspace to build, automate, evaluate, and deploy AI systems.',
  },
};

export const viewport: Viewport = {
  themeColor: '#04050d',
  width: 'device-width',
  initialScale: 1,
};

const themeBoot = `
try {
  var s = JSON.parse(localStorage.getItem('sutra:app:v3') || '{}');
  var t = (s.settings && s.settings.theme) || 'dark';
  document.documentElement.dataset.theme = t;
} catch (e) {
  document.documentElement.dataset.theme = 'dark';
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is rewritten by the boot script above (and by the store's
    // theme effect) to the user's saved theme. The server always renders
    // 'dark', so allow that one attribute to be patched pre-hydration without
    // a hydration warning.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        {/* Optional Puter.js infrastructure layer — local mode never requires it. */}
        <PuterScript />
        <SutraProvider>
          <AmbientController />
          {children}
        </SutraProvider>
      </body>
    </html>
  );
}
