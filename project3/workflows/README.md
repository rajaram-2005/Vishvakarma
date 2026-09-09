# SUTRA Workflows

Bundled workflows in SUTRA JSON (the same format the Workflows surface
edits and simulates). Each exports to **standard n8n JSON** via
`POST /api/v1/workflows/n8n` or the web export button — adapter pattern,
n8n's terms respected.

| id | name | trigger | chain |
|---|---|---|---|
| `wf-oncall-digest` | On-call Digest | schedule (daily 09:00) | gather → summarize (AI) → **approval** → post |
| `wf-repo-pulse` | Repo Pulse | schedule (weekly) | fetch → analyze (AI) → secret scan → risk gate → report / **approval** |
| `wf-autonomous-dev` | Autonomous Development | manual | goal → architect → planner → coder → terminal → browser → tester → security → reviewer → **approval** → deploy |

## Format

```jsonc
{
  "id": "wf-…", "name": "…", "trigger": "manual | schedule | webhook | cron",
  "nodes": [
    { "id": "a", "type": "trigger|ai|http|shell|condition|setVar|approval",
      "label": "…", "config": { … } }
  ],
  "edges": [["a", "b"], …]          // DAG — cycles rejected by validation
}
```

`condition` evaluates `${expr}` against `vars`; the true edge runs first,
false edges follow. `approval` nodes are hard stops — a human decides.
