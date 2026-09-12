/** Thin GitHub REST client for the Coding Factory. */

let API = "https://api.github.com";
/** Test hook: point the client at a mock server. */
export function __setApiBase(url: string) { API = url; }

export class GitHubError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GH {
  token: string;
  login: string;
}

async function gh<T>(g: GH, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${g.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "aetheris-one",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      msg = j.message ?? msg;
    } catch { /* ignore */ }
    throw new GitHubError(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}: ${msg}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function viewer(token: string): Promise<{ login: string; avatar_url: string }> {
  return gh({ token, login: "" }, "/user");
}

/** Ensure the private factory repo exists (with an initial commit so refs exist). */
export async function ensureRepo(g: GH, name: string): Promise<{ default_branch: string; html_url: string }> {
  try {
    return await gh(g, `/repos/${g.login}/${name}`);
  } catch (e) {
    if (!(e instanceof GitHubError) || e.status !== 404) throw e;
  }
  const repo = await gh<{ default_branch: string; html_url: string }>(g, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      private: true,
      auto_init: true,
      description: "Aetheris One — cloud coding factory (auto-generated runs)",
    }),
  });
  // Give GitHub a moment to materialise the initial commit.
  for (let i = 0; i < 10; i++) {
    try {
      await gh(g, `/repos/${g.login}/${name}/git/ref/heads/${repo.default_branch}`);
      return repo;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return repo;
}

export interface FileSpec { path: string; content: string }

/**
 * Create ONE commit containing all files on a fresh branch (Git Data API), so exactly one
 * workflow run is triggered. Returns the commit SHA and branch name.
 */
export async function commitFilesToBranch(
  g: GH,
  repo: string,
  baseBranch: string,
  branch: string,
  files: FileSpec[],
  message: string,
): Promise<{ sha: string; branch: string; url: string }> {
  const R = `/repos/${g.login}/${repo}`;
  const base = await gh<{ object: { sha: string } }>(g, `${R}/git/ref/heads/${baseBranch}`);
  const baseCommit = await gh<{ tree: { sha: string } }>(g, `${R}/git/commits/${base.object.sha}`);

  const tree = await Promise.all(
    files.map(async (f) => {
      const blob = await gh<{ sha: string }>(g, `${R}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: Buffer.from(f.content, "utf8").toString("base64"), encoding: "base64" }),
      });
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );

  const newTree = await gh<{ sha: string }>(g, `${R}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
  });
  const commit = await gh<{ sha: string; html_url: string }>(g, `${R}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [base.object.sha] }),
  });
  await gh(g, `${R}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  });
  return { sha: commit.sha, branch, url: commit.html_url };
}

export interface WorkflowRun {
  id: number;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
}

/** Poll until a workflow run for `sha` exists and completes. */
export async function waitForRun(
  g: GH,
  repo: string,
  sha: string,
  opts: { timeoutMs?: number; onUpdate?: (run: WorkflowRun | null) => void; signal?: AbortSignal } = {},
): Promise<WorkflowRun> {
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60_000);
  let lastStatus = "";
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error("aborted");
    const { workflow_runs } = await gh<{ workflow_runs: WorkflowRun[] }>(
      g,
      `/repos/${g.login}/${repo}/actions/runs?head_sha=${sha}&per_page=5`,
    );
    const run = workflow_runs[0] ?? null;
    const status = run ? `${run.status}:${run.conclusion ?? ""}` : "none";
    if (status !== lastStatus) {
      lastStatus = status;
      opts.onUpdate?.(run);
    }
    if (run && run.status === "completed") return run;
    await new Promise((r) => setTimeout(r, Number(process.env.AETHERIS_CI_POLL_MS ?? 4000)));
  }
  throw new Error("Timed out waiting for GitHub Actions run to complete");
}

export interface Job {
  id: number;
  name: string;
  conclusion: string | null;
  steps?: { name: string; conclusion: string | null; number: number }[];
}

export async function runJobs(g: GH, repo: string, runId: number): Promise<Job[]> {
  const { jobs } = await gh<{ jobs: Job[] }>(g, `/repos/${g.login}/${repo}/actions/runs/${runId}/jobs`);
  return jobs;
}

/** Plain-text log for a single job (GitHub redirects to blob storage; fetch follows it). */
export async function jobLog(g: GH, repo: string, jobId: number): Promise<string> {
  const res = await fetch(`${API}/repos/${g.login}/${repo}/actions/jobs/${jobId}/logs`, {
    headers: {
      Authorization: `Bearer ${g.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aetheris-one",
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new GitHubError(`Could not fetch job log (${res.status})`, res.status);
  return res.text();
}
