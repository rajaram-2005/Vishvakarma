/**
 * Lumen Analyst — an own, offline data-analysis model.
 * Parses CSV / TSV / whitespace tables and number lists, computes stats
 * and detects trends. Deterministic, no network.
 */

function parseTable(text: string): { headers: string[]; rows: string[][] } | null {
  const clean = text.replace(/```[a-z]*\n?|```/gi, '').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const sep = /\t/.test(lines[0]) ? '\t' : (lines[0].match(/,/g)?.length ?? 0) >= (lines[0].match(/;/g)?.length ?? 0) && /,/.test(lines[0]) ? ',' : /;/.test(lines[0]) ? ';' : /\s{2,}/.test(lines[0]) ? /\s{2,}/ : null;
  if (!sep) return null;
  const split = (l: string) => (sep instanceof RegExp ? l.split(sep) : l.split(sep)).map((c) => c.trim());
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split).filter((r) => r.length === headers.length && r.some((c) => /\d/.test(c)));
  if (rows.length < 1) return null;
  return { headers, rows };
}

function trend(values: number[]): string {
  if (values.length < 3) return 'not enough points for a trend';
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (values[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = num / den;
  const direction = Math.abs(slope) < 1e-9 ? 'flat' : slope > 0 ? 'rising' : 'falling';
  const pct = my !== 0 ? Math.abs((slope * (n - 1)) / my) * 100 : 0;
  return `${direction} (slope ${slope >= 0 ? '+' : ''}${slope.toFixed(3)}/row · ≈${pct.toFixed(1)}% across the series)`;
}

/** The analyst model's entry point. Returns '' when the prompt is not data. */
export function analystAnswer(prompt: string): string {
  const table = parseTable(prompt);
  if (table) {
    const { headers, rows } = table;
    const out: string[] = [`**Data analysis** — ${rows.length} rows × ${headers.length} columns`];
    const insights: string[] = [];
    for (let c = 0; c < headers.length; c++) {
      const values = rows.map((r) => parseFloat(r[c])).filter((v) => Number.isFinite(v));
      if (values.length === rows.length) {
        const m = values.reduce((a, b) => a + b, 0) / values.length;
        out.push(`**${headers[c]}** — mean ${m.toFixed(2)} · min ${Math.min(...values)} · max ${Math.max(...values)} · ${trend(values)}`);
        insights.push(`“${headers[c]}” is the ${trend(values).split(' ')[0]} series.`);
      }
    }
    if (!insights.length) {
      const textCol = headers.find((h, i) => rows.every((r) => Number.isNaN(parseFloat(r[i]))));
      if (textCol) {
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r[headers.indexOf(textCol)], (counts.get(r[headers.indexOf(textCol)]) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        out.push(`Most frequent “${textCol}”: ${top.map(([k, v]) => `${k} ×${v}`).join(', ')}`);
      }
    }
    out.push(`\nInsights:\n${insights.length ? insights.map((i) => `• ${i}`).join('\n') : '• numeric columns analyzed — paste rows with numbers for stats'}`);
    out.push(`\nComputed on-device by Lumen Analyst — no data left the machine.`);
    return out.join('\n');
  }

  const nums = prompt.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter((n) => Number.isFinite(n)) ?? [];
  if (nums.length >= 4 && /data|numbers|series|trend|list/.test(prompt.toLowerCase())) {
    const m = nums.reduce((a, b) => a + b, 0) / nums.length;
    return [
      `**Number series** — ${nums.length} values`,
      `mean ${m.toFixed(2)} · min ${Math.min(...nums)} · max ${Math.max(...nums)}`,
      `trend: ${trend(nums)}`,
      `\nOn-device by Lumen Analyst.`,
    ].join('\n');
  }
  return '';
}
