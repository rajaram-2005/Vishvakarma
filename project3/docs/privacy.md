# SUTRA Privacy

**The contract: your machine is the source of truth. Nothing leaves it
silently, and nothing dangerous happens without you.**

## Modes

| Mode | What runs locally | What may contact the network |
|---|---|---|
| **Local** (default) | chat (SUTRA Local + local runtimes), routing, RAG, memory, tasks, workflows, agents, IDE, security, evaluation, local deploys | **only private/loopback hosts** (your Ollama, your vLLM). The service API's egress guard *blocks* and *logs* every attempt to a public host (`GET /api/v1/audit`) |
| **Hybrid** | everything | configured provider hosts (your API endpoints). Every outbound request is still logged |
| **Cloud** | everything | provider + sync hosts, per the sync scope |

## Sync scopes

`none` (default) → `metadata` → `projects` (selected) → `folders`
(selected) → `workspace`. Scope is applied **per outbound request** — there
is no background sync daemon that can drift.

## Hard rules (enforced in code)

1. **No silent uploads.** In local mode, non-private egress is blocked by
   `services/api` (`EgressLog`) and simply doesn't exist in the client —
   the client core makes zero network calls it doesn't declare.
2. **No forced identity.** Puter (KV/FS/auth/AI/hosting) is optional
   infrastructure. Local mode never asks for it. When connected, the footer
   shows "Powered by Puter → https://developer.puter.com".
3. **No silent danger.** The security gateway classifies every tool call:
   Low passes, Medium+ asks, **Critical always asks** (a session grant can
   never mask a critical action). Approvals: Allow Once / Allow Session /
   Inspect — all recorded in the audit log.
4. **Secrets stay masked.** Secret scans return *line + kind*, never the
   value. Bundles that contain secret patterns are refused (`409
   secrets_detected`) and never written.
5. **Honest failure.** If there is no evidence, the answer is "I can't
   verify this". If a model is unreachable, the UI says so. No fabricated
   capability.
6. **Deletable memory.** Every memory, document, task and approval is
   inspectable and deletable from its own surface.

## Where data lives

| Data | Local mode |
|---|---|
| UI state, FS, git VM, KV, traces | browser `localStorage` (`sutra:app:v3`) |
| Tasks (Projects) | Puter KV **or** localStorage `sutra:kv:` fallback |
| Service state (documents, chunks, tasks, bundles, audit) | `SUTRA_DATA_DIR/*.json` (default `./data`) |
| Model weights | your runtime (Ollama etc.) — SUTRA never stores weights |
| Cloud (hybrid/cloud only) | PostgreSQL / Redis / Qdrant per `infrastructure/` |

## What we will never do

- phone home in local mode
- train on your content
- upload a file without a visible, per-action confirmation
- bypass an approval with a configuration flag
- require an account to use the core workspace
