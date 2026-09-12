// Lumen — GitHub as a first-class citizen.
// Live, read-only, no token required for public repos (CORS-friendly API).

export interface RepoInfo {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
  license: string;
  sizeKb: number;
  pushedAt: string;
  defaultBranch: string;
  languages: Array<{ name: string; bytes: number }>;
  latestRelease?: { tag: string; name: string; publishedAt: string };
  recentCommits: Array<{ hash: string; message: string; date: string }>;
  capabilities: string[];
  compat: string[];
}

async function jget(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

export async function fetchRepo(owner: string, repo: string): Promise<RepoInfo> {
  const meta = (await jget(`https://api.github.com/repos/${owner}/${repo}`)) as Record<string, any>;
  const [langsRaw, relRes, commitsRes, issuesRes] = await Promise.all([
    jget(`https://api.github.com/repos/${owner}/${repo}/languages`).catch(() => null),
    jget(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=1`).catch(() => []),
    jget(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=3`).catch(() => []),
    jget(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=1`).catch(() => null),
  ]);
  const languages = Object.entries((langsRaw as Record<string, number>) ?? {}).map(([name, bytes]) => ({ name, bytes }));
  const total = languages.reduce((a, l) => a + l.bytes, 0) || 1;
  const top = languages[0]?.name ?? '—';
  const openIssues = Array.isArray(issuesRes) ? (meta.open_issues ?? 0) : (meta.open_issues ?? 0);
  const releases = Array.isArray(relRes) ? relRes : [];
  const commits = Array.isArray(commitsRes) ? commitsRes : [];

  const capabilities: string[] = [];
  if (['TypeScript', 'JavaScript'].includes(top)) capabilities.push('typed web stack');
  if (/python/i.test(top)) capabilities.push('python services');
  if (top === '—') capabilities.push('mixed/unknown');
  const lic = String(meta.license?.spdx_id ?? '').toUpperCase();
  if (/MIT|APACHE|BSD/.test(lic)) capabilities.push(`permissive license (${lic})`);
  else if (lic) capabilities.push(`license: ${lic}`);
  if ((meta.stargazers_count ?? 0) > 500) capabilities.push('community-validated');

  const compat: string[] = [];
  compat.push(`${top || 'unknown'} primary → adapter coverage: high`);
  if (/TypeScript|JavaScript/.test(top)) compat.push('Next.js / Tauri / Expo surfaces compatible');
  if (/python/i.test(top)) compat.push('FastAPI service layer compatible');
  compat.push(`license ${lic || 'ALL RIGHTS RESERVED'} → ${/MIT|APACHE|BSD/.test(lic) ? 'safe to integrate' : 'review before integrating'}`);

  return {
    owner,
    repo,
    description: String(meta.description ?? '—'),
    stars: meta.stargazers_count ?? 0,
    forks: meta.forks_count ?? 0,
    openIssues,
    language: top,
    license: lic || 'none',
    sizeKb: meta.size ?? 0,
    pushedAt: String(meta.pushed_at ?? ''),
    defaultBranch: String(meta.default_branch ?? 'main'),
    languages: languages.slice(0, 6),
    latestRelease: releases[0]
      ? { tag: String(releases[0].tag_name), name: String(releases[0].name ?? releases[0].tag_name), publishedAt: String(releases[0].published_at) }
      : undefined,
    recentCommits: commits.slice(0, 3).map((c: any) => ({
      hash: String(c.sha).slice(0, 7),
      message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 90),
      date: String(c.commit?.author?.date ?? ''),
    })),
    capabilities,
    compat,
    // total used for the UI bar
    ...({ totalBytes: total } as object),
  };
}
