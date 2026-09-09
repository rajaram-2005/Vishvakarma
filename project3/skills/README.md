# SUTRA Skills

A **skill** is the **HOW**: a reusable, versioned playbook for a task.
It is *not* a model, *not* a prompt dump, and *not* memory — it's the
repeatable procedure an agent or human can follow, with inputs, steps,
and a definition of done. Memory is the **WHAT** (facts the system knows);
a skill is the **HOW** (how the system works).

Each skill is a manifest with an optional `steps[]` procedure and a
`definitionOfDone`. Skills are registry items (kind `skill`) and can be
attached to agents or invoked from the Skills surface.

## List

| id | name | version | summary |
|---|---|---|---|
| `skill-rag-tuning` | RAG Tuning | 1.0.0 | Tune chunk size, overlap, rerank blend, citations for grounded answers |
| `skill-data-pipeline` | Data Pipeline | 0.9.2 | Source → normalize → validate → store, idempotent |
| `skill-eval-harness` | Evaluation Harness | 1.1.0 | Build a reproducible benchmark with refusal + hallucination probes |
| `skill-incident-response` | Incident Response | 0.7.0 | Triage → contain → mitigate → postmortem |

## Manifest contract

```jsonc
{
  "id": "skill-…", "name": "…", "version": "x.y.z",
  "author": "…", "license": "MIT",
  "kind": "skill",
  "scopes": ["fs.read"],            // declared up front; install = explicit grant
  "inputs": [ { "name": "…", "type": "string", "required": true } ],
  "steps": [ { "title": "…", "detail": "…" } ],
  "definitionOfDone": "…",
  "entry": "index.md"               // prose playbook the agent reads
}
```

Skills never request `secrets` scope implicitly; anything that needs a
secret goes through the vault tool with a per-action approval.
