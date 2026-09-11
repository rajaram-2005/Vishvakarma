// Lumen — tiny regex tokenizer for the editor (TS/JS/JSON/Python/MD/Bash).
// Returns token classes; rendering is a plain <pre>, no editor framework.

export interface Token {
  t: string;
  c: string; // css class suffix: kw str num com fun ident plain
}

const KW = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'interface',
  'type', 'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'extends',
  'implements', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
  'def', 'lambda', 'yield', 'pass', 'raise', 'with', 'as', 'in', 'not', 'and', 'or', 'is',
  'null', 'true', 'false', 'undefined', 'void', 'number', 'string', 'boolean',
]);

const RE_TS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b|([{}()[\];,.:=+\-*/<>!&|?~^%]+|\s+|\S)/g;

export function tokenizeLine(line: string, lang: string): Token[] {
  if (lang === 'md') {
    if (/^#{1,6}\s/.test(line)) return [{ t: line, c: 'kw' }];
    if (/^\s*[-*]\s/.test(line)) return [{ t: line.slice(0, 2), c: 'num' }, { t: line.slice(2), c: 'plain' }];
    return [{ t: line, c: 'plain' }];
  }
  if (lang === 'bash') {
    if (/^\s*#/.test(line)) return [{ t: line, c: 'com' }];
    const toks: Token[] = [];
    const re = /(\$\w+|\$\{[^}]+\})|(--?[\w-]+)|(\s+)|(\S)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[1]) toks.push({ t: m[1], c: 'num' });
      else if (m[2]) toks.push({ t: m[2], c: 'str' });
      else if (m[3]) toks.push({ t: m[3], c: 'plain' });
      else toks.push({ t: m[4], c: 'ident' });
    }
    return toks;
  }
  const useTernary = lang !== 'json';
  const re = new RegExp(
    [
      '(?<com>(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#[^\\n]*))',
      '(?<str>(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`))',
      '(?<num>\\b\\d+(?:\\.\\d+)?\\b)',
      '(?<id>[A-Za-z_$][\\w$]*)',
      '(?<punct>[{}()[\\];,.:=+\\-*/<>!&|?~^%#@]+|\\s+|\\S)',
    ].join('|'),
    'g',
  );
  void RE_TS;
  void useTernary;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.groups?.com) out.push({ t: m[0], c: 'com' });
    else if (m.groups?.str) out.push({ t: m[0], c: 'str' });
    else if (m.groups?.num) out.push({ t: m[0], c: 'num' });
    else if (m.groups?.id) {
      const w = m[0];
      if (KW.has(w)) out.push({ t: w, c: 'kw' });
      else if (/^\s*\(/.test(line.slice(re.lastIndex)) || /\(\s*\)$/.test(line.slice(0, m.index)) || line[re.lastIndex] === '(')
        out.push({ t: w, c: 'fun' });
      else out.push({ t: w, c: 'ident' });
    } else out.push({ t: m[0], c: 'plain' });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

export function langForPath(path: string): string {
  const ext = path.split('.').pop() ?? '';
  if (['ts', 'tsx'].includes(ext)) return 'ts';
  if (['js', 'jsx'].includes(ext)) return 'js';
  if (ext === 'json') return 'json';
  if (ext === 'py') return 'py';
  if (ext === 'md') return 'md';
  if (ext === 'sh' || ext === 'bash') return 'bash';
  if (['css'].includes(ext)) return 'css';
  return 'ts';
}
