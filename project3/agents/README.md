# Aetherion Agents

Declarative agent definitions. The web workspace seeds from these same
fields; `services/agent` runs them server-side.

| id | name | role | permissions | sandbox | team |
|---|---|---|---|---|---|
| `ag-architect` | Architect | system design | fs.read, fs.write | workspace | autonomous-dev |
| `ag-planner` | Planner | task decomposition | fs.read, fs.write | workspace | autonomous-dev |
| `ag-coder` | Coder | implementation | fs.*, code.exec, terminal.exec | workspace | autonomous-dev |
| `ag-tester` | Tester | verification | fs.read, code.exec, terminal.exec | workspace | autonomous-dev |
| `ag-security` | Sentinel | security review (blocking) | fs.read, terminal.exec | workspace | autonomous-dev |
| `ag-reviewer` | Reviewer | review + approval gate | fs.read | workspace | autonomous-dev |
| `ag-researcher` | Scout | research & retrieval | fs.read, network.request, fs.write | workspace | — |
| `ag-writer` | Scribe | documentation | fs.read, fs.write | workspace | — |

## Contract

- **steps** — the canonical 8-step loop:
  `Understand → Plan → Tools → Execute → Observe → Verify → Repair → Finalize`
- **permissions** — tool *categories* the agent may request; every call is
  still assessed per-action by the security gateway (Allow Once / Session /
  Inspect). Critical actions are never auto-approved.
- **sandbox** — `workspace` (project-scoped FS + sandboxed terminal) or
  `strict` (deploy/ops only, no network by default)
- **blocking** — a `blocking: true` agent (Sentinel) can halt the team on a
  finding; nothing downstream runs past a red Sentinel.
- **handoff** — next agent in the team chain (`autonomous-dev`:
  architect → planner → coder → tester → security → reviewer →
  human-approval → deploy)
