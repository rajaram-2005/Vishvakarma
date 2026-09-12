/**
 * Lumen Coder — an own, offline code-intelligence model.
 * Deterministic structure analysis, honest review notes and snippet
 * generation. Runs entirely on-device.
 */

const SNIPPETS: Array<{ keys: RegExp; lang: string; title: string; code: string }> = [
  {
    keys: /fizzbuzz/i, lang: 'ts', title: 'FizzBuzz',
    code: `function fizzbuzz(n: number): string[] {\n  const out: string[] = [];\n  for (let i = 1; i <= n; i++) {\n    if (i % 15 === 0) out.push('FizzBuzz');\n    else if (i % 3 === 0) out.push('Fizz');\n    else if (i % 5 === 0) out.push('Buzz');\n    else out.push(String(i));\n  }\n  return out;\n}`,
  },
  {
    keys: /debounce/i, lang: 'ts', title: 'debounce',
    code: `function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {\n  let t: ReturnType<typeof setTimeout> | undefined;\n  return (...args: A) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n}`,
  },
  {
    keys: /retry|fetch with/i, lang: 'ts', title: 'fetch with retry',
    code: `async function fetchRetry(url: string, opts: RequestInit = {}, attempts = 3) {\n  for (let i = 0; i < attempts; i++) {\n    try {\n      const res = await fetch(url, opts);\n      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\n      return res;\n    } catch (e) {\n      if (i === attempts - 1) throw e;\n      await new Promise((r) => setTimeout(r, 250 * 2 ** i)); // exponential backoff\n    }\n  }\n  throw new Error('unreachable');\n}`,
  },
  {
    keys: /flatten|deep array/i, lang: 'ts', title: 'flatten (recursive)',
    code: `type Deep<T> = T | Deep<T>[];\nfunction flatten<T>(arr: Deep<T>[]): T[] {\n  return arr.reduce<T[]>((acc, v) => acc.concat(Array.isArray(v) ? flatten(v) : [v]), []);\n}`,
  },
  {
    keys: /binary search/i, lang: 'ts', title: 'binary search',
    code: `function binarySearch(sorted: number[], target: number): number {\n  let lo = 0, hi = sorted.length - 1;\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1;\n    if (sorted[mid] === target) return mid;\n    if (sorted[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}`,
  },
];

function analyze(code: string): string {
  const lines = code.split('\n');
  const funcs = code.match(/(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>|def\s+([A-Za-z0-9_]+)\s*\()/g) ?? [];
  const classes = code.match(/(?:class|interface|type)\s+[A-Za-z0-9_$]+/g) ?? [];
  const imports = code.match(/^\s*(?:import|from)\s+.+$/gm) ?? [];
  const todos = code.match(/\/\/\s*TODO.*|#\s*TODO.*|\/\*.*TODO.*\*\//gi) ?? [];
  const exported = code.match(/export\s+(?:default\s+)?(?:class|function|const|let|var|type|interface)/g) ?? [];
  let depth = 0, maxDepth = 0;
  for (const l of lines) { for (const ch of l) { if (ch === '{' || ch === '(' || ch === '[') depth++; if (ch === '}' || ch === ')' || ch === ']') depth--; maxDepth = Math.max(maxDepth, depth); } }

  const langGuess = /def\s+\w+\(/.test(code) ? 'Python' : /=>|\bconst\b|\binterface\b/.test(code) ? 'TypeScript/JavaScript' : 'unknown';

  const notes: string[] = [];
  if (maxDepth > 4) notes.push(`deep nesting detected (max depth ${maxDepth}) — consider extracting helper functions`);
  if (lines.length > 0 && lines.filter((l) => l.trim().length > 120).length > 0) notes.push('some lines exceed 120 chars — split for readability');
  if (todos.length > 0) notes.push(`${todos.length} TODO(s) found — finish or file them`);
  if (imports.length === 0 && funcs.length > 0) notes.push('no imports detected — self-contained module');

  return [
    `**Code analysis** (${langGuess}) — ${lines.length} lines`,
    `• ${funcs.length} function${funcs.length === 1 ? '' : 's'}, ${classes.length} type${classes.length === 1 ? '' : 's'}/class${classes.length === 1 ? '' : 'es'}, ${imports.length} import${imports.length === 1 ? '' : 's'}, ${exported.length} export${exported.length === 1 ? '' : 's'}`,
    `• max nesting depth: ${maxDepth} · long lines: ${lines.filter((l) => l.trim().length > 120).length}`,
    ...notes.map((n) => `• ${n}`),
    `\nHonest note: this is structural analysis only — Lumen Coder does not run your code. For execution semantics, paste into the Tools → Tester agent.`,
  ].join('\n');
}

function explainCode(code: string): string {
  const parts = code.split('\n').slice(0, 40);
  return [
    `**Walkthrough** — ${code.split('\n').length} lines, showing the first ${parts.length}:`,
    parts.map((l, i) => `${String(i + 1).padStart(2, ' ')} │ ${l}`).join('\n'),
    `\nReading it: ${/async|await/.test(code) ? 'the code is asynchronous — calls return promises and resume after awaits.' : ''}${/try\s*\{/.test(code) ? ' Errors are handled with try/catch.' : ' No try/catch detected — consider error paths.'}${/export/.test(code) ? ' Parts of this module are exported for reuse.' : ''}`,
    `\nLocal explanation only — connect a larger model (or the embedded Aetheris core) for semantic depth.`,
  ].join('\n');
}

/** The coder model's entry point. */
export function codeAnswer(prompt: string): string {
  const t = prompt.trim();
  // snippet generation
  for (const s of SNIPPETS) {
    if (s.keys.test(t)) {
      return `**${s.title}** (generated on-device, deterministic)\n\n\`\`\`${s.lang}\n${s.code}\n\`\`\`\n\nAetherion Coder wrote this from its local snippet library — no network involved.`;
    }
  }
  // code block present → analyze or explain it
  const block = t.match(/```[a-z]*\n([\s\S]+?)```/i);
  const inline = !block && /\b(function|def |class |const |import |=>)\b/.test(t) ? t : '';
  const code = block ? block[1] : inline;
  if (code) {
    return /explain|walkthrough|what does this do/i.test(t)
      ? explainCode(code)
      : analyze(code);
  }
  if (/review|analy[sz]e my code|check this code/.test(t) && !code) {
    return 'Paste your code (in a ``` code block ```) and I will analyze it on-device: structure, depth, TODOs, exports — with an honest note about what structural analysis can and cannot see.';
  }
  if (/write|create|generate|implement/.test(t)) {
    return 'Tell me which pattern you need — fizzbuzz, debounce, fetch-with-retry, flatten, binary search — and I will generate it locally. For anything bigger, delegate to the embedded Aetheris core (Workspace → Aetheris) or a connected model.';
  }
  return '';
}
