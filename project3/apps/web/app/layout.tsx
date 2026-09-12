import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SutraProvider } from '@/lib/store';
import { AmbientController } from '@/lib/AmbientController';
import { PuterScript } from '@/lib/puter';

export const metadata: Metadata = {
  title: 'Lumen — One Studio. Every Model.',
  description:
    'Lumen Studio — the unified AI studio. One chat for every model, agents, coding, image/video/audio/document generation, plugins, MCP, schedules and a personal library. Online-first, provider-neutral, honest about limits.',
  keywords: ['Lumen', 'AI studio', 'multi-model chat', 'AI coder', 'AI image generation', 'plugins', 'MCP', 'schedules', 'library'],
  openGraph: {
    title: 'Lumen — One Studio. Every Model.',
    description: 'Chat, create, build and automate with every model in one workspace.',
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
