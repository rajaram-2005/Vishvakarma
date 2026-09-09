import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { SutraProvider } from '@/lib/store';
import { AmbientController } from '@/lib/AmbientController';

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
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        {/* Optional Puter.js infrastructure layer — local mode never requires it. */}
        <Script src="https://js.puter.com/v2/" strategy="lazyOnload" />
        <SutraProvider>
          <AmbientController />
          {children}
        </SutraProvider>
      </body>
    </html>
  );
}
