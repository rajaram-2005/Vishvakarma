/**
 * GitHub Repository Intelligence (Phase 9).
 *
 *   repoMap        tree + language mix + key files + module hotspots (via GitHub REST; no clone needed)
 *   analyzeRepo    LLM summary of architecture, risks, entry points — grounded in the repo map + key files
 *   reviewPR       diff-grounded review with severity-ranked findings and optional posted comment
 *   triageIssues   cluster/label open issues, propose an action per issue
 *   proposePatch   plan → generate file edits for an existing repo → branch + commit + PR (needs confirmation)
 *
 * Status: IMPLEMENTED (GitHub REST + model router). UNTESTABLE in a sandbox without egress; every
 * function fails loudly on network/auth errors rather than pretending.
 */
import { route } from "@/aetheris/lib/router/router";
import type { GH } from "@/aetheris/lib/github/api";
import { traced } from "../observability/events";

const API = "https://api.github.com";
async function gh<T>(g: GH, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${g.token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aetheris-one", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return undefined as T;
  return (init.headers && (init.headers as Record<string, string>).Accept?.includes("diff") ? ((await res.text()) as unknown as T) : ((await res.json()) as T));
}

export interface RepoMap { repo: string; defaultBranch: string; description?: string; stars: number; languages: Record<string, number>; files: number; dirs: string[]; keyFiles: string[]; hotspots: { dir: string; files: number }[]; tree: string[]; truncated: boolean }
const KEY = /^(readme\.md|package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle|dockerfile|docker-compose\.ya?ml|makefile|requirements\.txt|tsconfig\.json|next\.config\.(js|ts|mjs)|\.github\/workflows\/.*\.ya?ml|src\/(index|main|app)\.[jt]sx?|main\.py|app\.py)$/i;

/** Build a structural map of a repository from the git tree (single API call + metadata). Pure formatting is tested via summarizeTree. */
export async function repoMap(g: GH, repo: string, ref?: string): Promise<RepoMap> {
  const meta = await gh<{ default_branch: string; description?: string; stargazers_count: number }>(g, `/repos/${repo}`);
  const branch = ref ?? meta.default_branch;
  const [langs, tree] = await Promise.all([gh<Record<string, number>>(g, `/repos/${repo}/languages`), gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(g, `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)]);
  const files = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
  return { repo, defaultBranch: branch, description: meta.description, stars: meta.stargazers_count, languages: langs, ...summarizeTree(files), truncated: tree.truncated };
}
/** Pure: derive dirs, key files, hotspots and a capped tree listing from file paths. */
export function summarizeTree(files: string[]) {
  const dirCount = new Map<string, number>();
  for (const f of files) { const d = f.includes("/") ? f.split("/").slice(0, 2).join("/") : "."; dirCount.set(d, (dirCount.get(d) ?? 0) + 1); }
  const hotspots = [...dirCount.entries()].filter(([d]) => d !== ".").map(([dir, n]) => ({ dir, files: n })).sort((a, b) => b.files - a.files).slice(0, 12);
  const dirs = [...new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))].sort();
  const keyFiles = files.filter((f) => KEY.test(f)).slice(0, 20);
  const skip = /(^|\/)(node_modules|dist|build|\.next|vendor|__pycache__|\.git)\//;
  const tree = files.filter((f) => !skip.test(f)).slice(0, 400);
  return { files: files.length, dirs, keyFiles, hotspots, tree };
}
async function fileText(g: GH, repo: string, path: string, ref: string, max = 6000): Promise<string> {
  try { const j = await gh<{ content?: string; encoding?: string }>(g, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`); return j.content ? Buffer.from(j.content, "base64").toString("utf8").slice(0, max) : ""; } catch { return ""; }
}

/** LLM architecture analysis grounded in the map and key files. */
export async function analyzeRepo(g: GH, repo: string, opts: { ref?: string; question?: string; preferred?: string } = {}) {
  return traced({ type: "tool", capability: "github:intelligence.analyze", detail: repo }, async () => {
    const map = await repoMap(g, repo, opts.ref);
    const keyBodies = await Promise.all(map.keyFiles.slice(0, 6).map(async (p) => `--- ${p}\n${await fileText(g, repo, p, map.defaultBranch, 3500)}`));
    const r = await route({ preferred: opts.preferred, temperature: 0.2, maxTokens: 1600, messages: [
      { role: "system", content: "You are a principal engineer producing a repository intelligence brief. Be concrete and cite file paths. Sections: Purpose · Architecture (modules, data flow) · Entry points · Build/CI · Risks & tech debt · Suggested first tasks. Never invent files not in the listing." },
      { role: "user", content: `Repository ${repo} (${map.defaultBranch}) — ${map.description ?? ""}\nLanguages: ${JSON.stringify(map.languages)}\nHotspots: ${map.hotspots.map((h) => `${h.dir}(${h.files})`).join(", ")}\nTree (${map.files} files${map.truncated ? ", truncated" : ""}):\n${map.tree.join("\n")}\n\nKey files:\n${keyBodies.join("\n")}${opts.question ? `\n\nFocus question: ${opts.question}` : ""}` } ] });
    return { map, brief: r.content, provider: r.provider, model: r.model };
  });
}

export interface ReviewFinding { severity: "blocker" | "major" | "minor" | "nit"; file?: string; line?: number; title: string; detail: string }
/** Pure: parse the model's JSON findings defensively. */
export function parseFindings(text: string): ReviewFinding[] {
  const m = /\[[\s\S]*\]/.exec(text); if (!m) return [];
  try { return (JSON.parse(m[0]) as Partial<ReviewFinding>[]).filter((f) => f && f.title).map((f) => ({ severity: (["blocker", "major", "minor", "nit"] as const).includes(f.severity as "nit") ? (f.severity as ReviewFinding["severity"]) : "minor", file: f.file, line: typeof f.line === "number" ? f.line : undefined, title: String(f.title), detail: String(f.detail ?? "") })).slice(0, 30); } catch { return []; }
}
/** Diff-grounded PR review. Posting a comment requires an explicit flag (safe_write + confirmation upstream). */
export async function reviewPR(g: GH, repo: string, number: number, opts: { post?: boolean; preferred?: string } = {}) {
  return traced({ type: "tool", capability: "github:intelligence.review", detail: `${repo}#${number}` }, async () => {
    const pr = await gh<{ title: string; body?: string; additions: number; deletions: number; changed_files: number; head: { sha: string } }>(g, `/repos/${repo}/pulls/${number}`);
    const diff = (await gh<string>(g, `/repos/${repo}/pulls/${number}`, { headers: { Accept: "application/vnd.github.diff" } })).slice(0, 60_000);
    const r = await route({ preferred: opts.preferred, temperature: 0.1, maxTokens: 1800, messages: [
      { role: "system", content: 'You are a rigorous code reviewer. Output ONLY a JSON array of findings: [{"severity":"blocker|major|minor|nit","file":"path","line":123,"title":"...","detail":"why + fix"}]. Cover correctness, security, performance, tests, API/back-compat. Empty array if clean. Cite only lines present in the diff.' },
      { role: "user", content: `PR: ${pr.title}\n${(pr.body ?? "").slice(0, 2000)}\n(+${pr.additions} −${pr.deletions}, ${pr.changed_files} files)\n\n${diff}` } ] });
    const findings = parseFindings(r.content);
    const verdict = findings.some((f) => f.severity === "blocker") ? "request_changes" : findings.some((f) => f.severity === "major") ? "comment" : "approve";
    let posted: string | undefined;
    if (opts.post) {
      const body = `## Aetheris review — ${verdict.replace("_", " ")}\n\n${findings.length ? findings.map((f) => `- **${f.severity}** ${f.file ? `\`${f.file}${f.line ? ":" + f.line : ""}\` ` : ""}${f.title}\n  ${f.detail}`).join("\n") : "No issues found in the diff."}\n\n_model: ${r.provider}/${r.model} · diff truncated to 60k chars_`;
      const c = await gh<{ html_url: string }>(g, `/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }); posted = c.html_url;
    }
    return { findings, verdict, posted, provider: r.provider, model: r.model, diffChars: diff.length };
  });
}

/** Issue triage: label suggestions + proposed action per open issue. Read-only unless `apply`. */
export async function triageIssues(g: GH, repo: string, opts: { limit?: number; apply?: boolean; preferred?: string } = {}) {
  return traced({ type: "tool", capability: "github:intelligence.triage", detail: repo }, async () => {
    const issues = (await gh<{ number: number; title: string; body?: string; labels: { name: string }[]; pull_request?: unknown }[]>(g, `/repos/${repo}/issues?state=open&per_page=${Math.min(50, opts.limit ?? 25)}`)).filter((i) => !i.pull_request);
    if (!issues.length) return { triage: [], applied: 0 };
    const r = await route({ preferred: opts.preferred, temperature: 0.1, maxTokens: 1800, messages: [
      { role: "system", content: 'Triage GitHub issues. Output ONLY JSON: [{"number":1,"labels":["bug"],"priority":"p0|p1|p2|p3","duplicateOf":null,"action":"one sentence"}]. Labels from: bug, enhancement, question, documentation, good first issue, needs-info, security, performance.' },
      { role: "user", content: issues.map((i) => `#${i.number} ${i.title}\n${(i.body ?? "").slice(0, 600)}\nlabels: ${i.labels.map((l) => l.name).join(",") || "-"}`).join("\n\n") } ] });
    const m = /\[[\s\S]*\]/.exec(r.content); const triage = m ? (JSON.parse(m[0]) as { number: number; labels?: string[]; priority?: string; duplicateOf?: number | null; action?: string }[]) : [];
    let applied = 0;
    if (opts.apply) for (const t of triage) { if (t.labels?.length && issues.some((i) => i.number === t.number)) { try { await gh(g, `/repos/${repo}/issues/${t.number}/labels`, { method: "POST", body: JSON.stringify({ labels: t.labels.slice(0, 4) }) }); applied++; } catch { /* label may not exist */ } } }
    return { triage, applied, provider: r.provider, model: r.model };
  });
}

/** One commit with all files on a fresh branch of any owner/repo (Git Data API). */
export async function commitToNewBranch(g: GH, repo: string, baseBranch: string, branch: string, files: { path: string; content: string }[], message: string) {
  const R = `/repos/${repo}`;
  const base = await gh<{ object: { sha: string } }>(g, `${R}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const baseCommit = await gh<{ tree: { sha: string } }>(g, `${R}/git/commits/${base.object.sha}`);
  const tree = await Promise.all(files.map(async (f) => ({ path: f.path, mode: "100644", type: "blob", sha: (await gh<{ sha: string }>(g, `${R}/git/blobs`, { method: "POST", body: JSON.stringify({ content: Buffer.from(f.content, "utf8").toString("base64"), encoding: "base64" }) })).sha })));
  const newTree = await gh<{ sha: string }>(g, `${R}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
  const commit = await gh<{ sha: string; html_url: string }>(g, `${R}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [base.object.sha] }) });
  await gh(g, `${R}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
  return { sha: commit.sha, url: commit.html_url };
}

/** Propose & push a patch to an existing repo on a new branch and open a PR. Caller must have obtained confirmation. */
export async function proposePatch(g: GH, repo: string, task: string, opts: { files?: string[]; preferred?: string; draft?: boolean } = {}) {
  return traced({ type: "tool", capability: "github:intelligence.patch", detail: `${repo}: ${task.slice(0, 60)}` }, async () => {
    const map = await repoMap(g, repo);
    const targets = opts.files?.length ? opts.files : map.tree.filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|md|json|ya?ml)$/.test(f)).slice(0, 200);
    const pick = await route({ preferred: opts.preferred, temperature: 0, maxTokens: 300, messages: [
      { role: "system", content: "Given a task and a file list, output ONLY a JSON array of up to 6 file paths (existing or new) that must change." },
      { role: "user", content: `Task: ${task}\nFiles:\n${targets.join("\n")}` } ] });
    const pm = /\[[\s\S]*\]/.exec(pick.content); const chosen: string[] = pm ? (JSON.parse(pm[0]) as string[]).slice(0, 6) : [];
    if (!chosen.length) throw new Error("planner could not choose files to change");
    const bodies = await Promise.all(chosen.map(async (p) => ({ path: p, text: await fileText(g, repo, p, map.defaultBranch, 12_000) })));
    const gen = await route({ preferred: opts.preferred, temperature: 0.1, maxTokens: 6000, messages: [
      { role: "system", content: 'Implement the task by rewriting the given files completely. Output ONLY JSON: {"summary":"...","files":[{"path":"...","content":"full new content"}]}. Keep unrelated code unchanged. No markdown fences.' },
      { role: "user", content: `Task: ${task}\n\n${bodies.map((b) => `=== ${b.path}\n${b.text || "(new file)"}`).join("\n\n")}` } ] });
    const gm = /\{[\s\S]*\}/.exec(gen.content); if (!gm) throw new Error("generator returned no JSON");
    const out = JSON.parse(gm[0]) as { summary?: string; files: { path: string; content: string }[] };
    if (!out.files?.length) throw new Error("generator produced no files");
    const branch = `aetheris/${Date.now().toString(36)}`;
    await commitToNewBranch(g, repo, map.defaultBranch, branch, out.files, `Aetheris: ${task.slice(0, 60)}`);
    const pr = await gh<{ html_url: string; number: number }>(g, `/repos/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title: task.slice(0, 80), head: branch, base: map.defaultBranch, draft: opts.draft ?? true, body: `${out.summary ?? ""}\n\nFiles: ${out.files.map((f) => f.path).join(", ")}\n\n_Generated by Aetheris (${gen.provider}/${gen.model}). Review before merging._` }) });
    return { branch, pr: pr.html_url, number: pr.number, files: out.files.map((f) => f.path), summary: out.summary };
  });
}
