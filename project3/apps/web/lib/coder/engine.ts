// Lumen Studio — Coder engine.
// One primary Coder with internal roles: planner, architect (scaffold
// generator), implementer, tester (deterministic lint), reviewer, security
// checker. Everything runs locally; execution of real builds is delegated
// to the sandboxed terminal with explicit confirmation.

export interface CoderFile {
  path: string;
  content: string;
  note?: string;
}

export interface CoderPlan {
  kind: 'react-app' | 'static-site' | 'node-api' | 'py-script' | 'unknown';
  name: string;
  summary: string;
  steps: string[];
  files: CoderFile[];
  risks: string[];
}

export interface LintIssue {
  file: string;
  line: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'project';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── architect: deterministic scaffold templates ──────────────────────────────
function reactApp(name: string): CoderFile[] {
  const title = escapeHtml(name);
  return [
    { path: 'package.json', content: `{\n  "name": "${slug(name)}",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },\n  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },\n  "devDependencies": { "@vitejs/plugin-react": "^4.3.0", "vite": "^6.0.0" }\n}\n` },
    { path: 'index.html', content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n` },
    { path: 'vite.config.js', content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 5173 },\n});\n` },
    { path: 'src/main.jsx', content: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './style.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);\n` },
    { path: 'src/App.jsx', content: `import { useState } from 'react';\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <main className="app">\n      <h1>${escapeHtml(name)}</h1>\n      <p>Scaffolded by the Lumen Coder. Edit <code>src/App.jsx</code> and save.</p>\n      <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>\n    </main>\n  );\n}\n` },
    { path: 'src/style.css', content: `:root { color-scheme: dark; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; background: #0b0d14; color: #e8eaf6; min-height: 100vh; display: grid; place-items: center; }\n.app { text-align: center; padding: 2rem; }\nh1 { background: linear-gradient(90deg, #8b7cff, #4cc9f0); -webkit-background-clip: text; background-clip: text; color: transparent; }\nbutton { background: #8b7cff; color: white; border: 0; border-radius: 999px; padding: 0.6rem 1.4rem; font-size: 1rem; cursor: pointer; }\ncode { background: rgba(255,255,255,.08); padding: 0.15rem 0.4rem; border-radius: 6px; }\n` },
    { path: 'README.md', content: `# ${title}\n\nScaffolded by the Lumen Coder.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nBuild with \`npm run build\`, preview with \`npm run preview\`.\n` },
  ];
}

function staticSite(name: string): CoderFile[] {
  const title = escapeHtml(name);
  return [
    { path: 'index.html', content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n    <link rel="stylesheet" href="style.css" />\n  </head>\n  <body>\n    <header class="hero">\n      <h1>${title}</h1>\n      <p>Built with the Lumen Coder.</p>\n    </header>\n    <main id="app"></main>\n    <script src="script.js"></script>\n  </body>\n</html>\n` },
    { path: 'style.css', content: `:root { color-scheme: dark; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; background: #0b0d14; color: #e8eaf6; }\n.hero { padding: 4rem 1.5rem 2rem; text-align: center; }\nh1 { margin: 0; font-size: 2.2rem; background: linear-gradient(90deg, #8b7cff, #4cc9f0); -webkit-background-clip: text; background-clip: text; color: transparent; }\n.hero p { color: #9aa0b8; }\nmain { max-width: 720px; margin: 0 auto; padding: 1rem 1.5rem 4rem; }\n` },
    { path: 'script.js', content: `// ${title} — client script\nconst app = document.getElementById('app');\napp.innerHTML = '<p>Static site ready. Edit script.js to build the experience.</p>';\n` },
  ];
}

function nodeApi(name: string): CoderFile[] {
  const title = escapeHtml(name);
  return [
    { path: 'package.json', content: `{\n  "name": "${slug(name)}",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": { "start": "node server.js", "dev": "node --watch server.js" }\n}\n` },
    { path: 'server.js', content: `import { createServer } from 'node:http';\n\nconst PORT = process.env.PORT ?? 3001;\n\nconst server = createServer((req, res) => {\n  const url = new URL(req.url ?? '/', 'http://localhost');\n  if (url.pathname === '/health') {\n    res.writeHead(200, { 'content-type': 'application/json' });\n    res.end(JSON.stringify({ ok: true, service: '${slug(name)}' }));\n    return;\n  }\n  res.writeHead(200, { 'content-type': 'application/json' });\n  res.end(JSON.stringify({ message: '${title} API', routes: ['/health'] }));\n});\n\nserver.listen(PORT, () => console.log('listening on :' + PORT));\n` },
    { path: 'README.md', content: `# ${title}\n\nZero-dependency Node API scaffolded by the Lumen Coder.\n\n\`\`\`bash\nnpm start\ncurl localhost:3001/health\n\`\`\`\n` },
  ];
}

function pyScript(name: string): CoderFile[] {
  const title = escapeHtml(name);
  return [
    { path: 'main.py', content: `"""${title} — scaffolded by the Lumen Coder."""\n\ndef main() -> None:\n    print("${title} ready.")\n\n\nif __name__ == "__main__":\n    main()\n` },
    { path: 'README.md', content: `# ${title}\n\n\`\`\`bash\npython3 main.py\n\`\`\`\n` },
  ];
}

// ── planner: natural language → project kind ─────────────────────────────────
export function planProject(request: string): CoderPlan {
  const text = request.toLowerCase();
  const nameMatch = request.match(/(?:called|named|for)\s+[“"']?([\w .-]{2,40})[”"']?(?:\s|$)/i);
  const name = (nameMatch?.[1] ?? 'New Project').trim();

  const detect = () => {
    if (/\b(react|next|vite|frontend|web app|website|app)\b/.test(text) && /\b(react|component|state|interactive)\b/.test(text)) return 'react-app' as const;
    if (/\b(website|site|landing page|page|html|static)\b/.test(text)) return 'static-site' as const;
    if (/\b(api|backend|server|endpoint|express|rest)\b/.test(text) || /\bnode\b/.test(text)) return 'node-api' as const;
    if (/\b(python|script|py|automation script)\b/.test(text)) return 'py-script' as const;
    return 'unknown' as const;
  };

  const kind = detect();
  const common: CoderPlan = {
    kind,
    name,
    summary: '',
    steps: [],
    files: [],
    risks: [],
  };

  switch (kind) {
    case 'react-app':
      return {
        ...common,
        summary: `A React application “${name}” with a Vite toolchain, component state and a dark UI theme.`,
        steps: ['Understand the request', 'Plan the file tree', 'Generate scaffold (React + Vite)', 'Lint the generated sources', 'Security review (no network code, no secrets)', 'Preview locally, then build'],
        files: reactApp(name),
        risks: ['Running it requires Node.js and npm install (network) — review dependencies before installing.'],
      };
    case 'static-site':
      return {
        ...common,
        summary: `A static site “${name}” — pure HTML/CSS/JS, no build step, previewable instantly.`,
        steps: ['Understand the request', 'Generate index.html + style.css + script.js', 'Lint', 'Preview in the browser pane'],
        files: staticSite(name),
        risks: ['No server-side logic — for APIs or auth, ask the Coder for a Node API.'],
      };
    case 'node-api':
      return {
        ...common,
        summary: `A zero-dependency Node.js API “${name}” with a /health endpoint.`,
        steps: ['Understand the request', 'Generate server.js + package.json', 'Lint', 'Run via the sandboxed terminal (requires confirmation)'],
        files: nodeApi(name),
        risks: ['Executing the server is a high-risk action and requires your confirmation in the Terminal.'],
      };
    case 'py-script':
      return {
        ...common,
        summary: `A Python script “${name}” with a typed entry point.`,
        steps: ['Understand the request', 'Generate main.py', 'Lint', 'Run via the sandboxed terminal (requires confirmation)'],
        files: pyScript(name),
        risks: ['Executing the script is a high-risk action and requires your confirmation in the Terminal.'],
      };
    default:
      return {
        ...common,
        summary: `I can scaffold React apps, static sites, Node APIs and Python scripts. “${request.slice(0, 80)}” — try “build a website called Portfolio”, “create a React app named Tasks”, or “make a Python script that renames files”.`,
        steps: ['Understand the request', 'Ask a clarifying question'],
        files: [],
        risks: [],
      };
  }
}

// ── tester: deterministic lint over the generated tree ───────────────────────
export function lintFiles(files: CoderFile[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const f of files) {
    const lines = f.content.split('\n');
    const pairs: Array<[string, string]> = [['{', '}'], ['(', ')'], ['[', ']']];
    for (const [open, close] of pairs) {
      let depth = 0;
      lines.forEach((line, i) => {
        for (const ch of line) {
          if (ch === open) depth++;
          if (ch === close) depth = Math.max(0, depth - 1);
        }
      });
      if (depth > 0) issues.push({ file: f.path, line: lines.length, level: 'warn', message: `${depth} unclosed “${open}”` });
    }
    if (/API[_-]?KEY|SECRET|PASSWORD\s*=/.test(f.content)) {
      issues.push({ file: f.path, line: 1, level: 'error', message: 'possible secret in source — remove before sharing' });
    }
    if (/eval\(|child_process|execSync|os\.system/.test(f.content)) {
      issues.push({ file: f.path, line: 1, level: 'warn', message: 'dynamic execution detected — review before running' });
    }
    if (/https?:\/\//.test(f.content)) {
      issues.push({ file: f.path, line: 1, level: 'info', message: 'network references present — verify the destinations' });
    }
  }
  if (issues.length === 0) issues.push({ file: 'all files', line: 0, level: 'info', message: 'lint clean — no unbalanced brackets, secrets or dynamic execution' });
  return issues;
}

// ── reviewer: security classification per generated file ─────────────────────
export function securityReview(files: CoderFile[]): Array<{ file: string; verdict: string }> {
  return files.map((f) => {
    if (/eval\(|child_process|execSync/.test(f.content)) return { file: f.path, verdict: 'review — dynamic execution' };
    if (/API[_-]?KEY|SECRET|PASSWORD\s*=/.test(f.content)) return { file: f.path, verdict: 'review — secrets' };
    return { file: f.path, verdict: 'ok' };
  });
}
