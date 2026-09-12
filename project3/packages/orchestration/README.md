# @sutra/orchestration — Unified AI Studio ONE CORE

The **single core** that every surface (Chat, Studio, Coder, Library, Plugins,
MCP, Schedules, Models, Workflows) is built on top of, per spec **§121**.
Rather than implementing those surfaces as independent applications, this
package provides the shared machinery they all compose from:

```
Identity · Context · Capability Registry · Model Router ·
Task Engine · Execution Engine · Permission Engine · Security ·
Storage · Observability · Event System
```

It is framework-free, synchronous where possible, Node- and browser-safe, and
**fully unit-tested** (66 tests).

## What's implemented

| Subsystem | Module | Spec |
| --- | --- | --- |
| Capability Graph & Contracts | `capabilities.ts` | §2, §4 |
| Compatibility Engine | `compatibility.ts` | §3 |
| Universal Task Graph | `taskgraph.ts` | §5, §6 |
| State Machine | `statemachine.ts` | §7 |
| Resumable Tasks | `statemachine.ts` (`ResumableTask`) | §8 |
| Model Router / Modes | `router.ts` | §11 |
| Model Fallback | `router.ts` (`fallbackChain`) | §9 |
| Provider Health | `router.ts` (`HealthRegistry`) | §10 |
| Event Bus | `events.ts` | §45 |
| Tracing / Observability | `trace.ts` | §63 |
| Planner (NL → Task Graph) | `planner.ts` | §5, §122 |
| OrchestrationCore (ONE CORE) | `core.ts` | §121 |

## Capability Contracts (§2 / §4)

Every model, plugin, MCP server, tool and workflow declares a
`CapabilityContract` with `id`, `version`, `type`, `provider`, `capabilities`,
`inputs`, `outputs`, `dependencies`, `permissions`, `modalities`, `runtime`,
`hardware`, `network`, `license`, `securityLevel`, `availability`. The registry
(`CapabilityRegistry`) resolves versioned lookups, transitive dependencies and
missing-dependency detection, and answers `canCompose()` (does a producer's
output feed a consumer's input?).

## Compatibility Engine (§3)

`CompatibilityEngine.analyze()` runs the pre-execution chain:

```
dependency → permission → network → privacy(policy) → hardware
→ license → availability → input/output (composition)
```

It never connects incompatible components, and — given a `fallbackPool` —
suggests the first compatible fallback. Offline, private-privacy and
license allow/block lists are all enforced.

## Universal Task Graph (§5 / §6)

`TaskGraphBuilder` produces nodes carrying `input / output / dependencies /
model / tools / permissions / status / retries / result / evidence`. `validate()`
rejects missing dependencies and cycles; `topoOrder()` returns a safe execution
order; `nextRunnable()` / `cascadeSkip()` drive execution and failure handling.

## State Machine + Resumable Tasks (§7 / §8)

`StateMachine` enforces the explicit state graph
`QUEUED → PLANNING → … → RUNNING → VERIFYING → COMPLETED` and the failure path
`RUNNING → FAILED → RETRYING → RECOVERING → COMPLETED`. `ResumableTask`
tracks checkpoints so a run interrupted by a crash, disconnect or restart can
resume from the last completed checkpoint instead of starting over.

## Model Router / Fallback / Health (§9 / §10 / §11)

`selectModel()` honours `AUTO / QUALITY / FAST / CHEAP / PRIVATE / LOCAL /
BALANCED / CUSTOM` with explicit priority orderings, and **never returns a
model that violates the privacy/offline context**. `fallbackChain()` preserves
capability overlap and respects privacy. `HealthRegistry` reports
`healthy / degraded / unavailable / rate-limited / auth-required` from live
success/error signals.

## Event Bus (§45) & Tracing (§63)

`EventBus` is a typed, async, wildcard-capable pub/sub backbone with
per-handler error isolation (`file.uploaded`, `task.completed`, `security.alert`,
…). `Tracer` records trace IDs with nested spans and exports OTLP-compatible
JSON reusing the shared `@sutra/shared` contract.

## Execution Engine (§121)

`OrchestrationCore` wires every subsystem together. `plan()` / `compose()` turn
a request into a validated task graph; `run()` walks it through the state
machine, retries failures (§7), pauses on permission requirements, cascades
failures to dependents, resumes from checkpoints (§8), emits events (§45) and
records a trace (§63). The actual model/tool calls are supplied by the caller
via a `NodeExecutor`, so the core stays deterministic and testable.

## Usage

```ts
import { OrchestrationCore, NeedsPermissionError } from '@sutra/orchestration';

const core = new OrchestrationCore();

// 1. Register capabilities (models, plugins, tools, MCP, …).
core.registerCapability({ id: 'research-model', version: '1.0', type: 'model', /* … */ });

// 2. Plan a request into a task graph + run compatibility.
const { graph } = core.plan(
  'Research solar EV charging, analyze these PDFs, create a report, ' +
  'generate a diagram, build a dashboard, save everything, and remind me every Saturday.',
);

// 3. Execute. The executor performs the real work for each node.
const result = await core.run(graph, {
  async execute(node) {
    if (node.permissions.includes('terminal.exec')) {
      throw new NeedsPermissionError('needs terminal', 'terminal.exec');
    }
    return { result: `done:${node.id}`, evidence: [`ev:${node.id}`] };
  },
}, { context: { offline: false, privacyMode: 'cloud', grantedPermissions: ['*'] }, pauseForPermission: true });

console.log(result.completed, result.paused, result.trace.spans.length);
```

## Tests

```
npx vitest run packages/orchestration
```

96 tests covering every subsystem and an end-to-end run of the §122
"final scenario" (research → PDF analysis → report → diagram → dashboard →
library → schedule) with retry, failure-cascade, permission-pause, approval and
resume behaviours. Typechecks clean under `strict` (`npm run typecheck`).

## Phase 2 — expanded subsystems

The core was extended to cover the full architecture breadth from the spec:

| Subsystem | Module | Spec |
| --- | --- | --- |
| Offline/Online Capability Matrix | `matrix.ts` | §60 |
| Offline cache policy & connectivity recovery | `matrix.ts` | §61, §62 |
| Context Builder & Budgeting | `context.ts` | §22, §23 |
| Universal Output Validation (repair/validate) | `validation.ts` | §17 |
| Cost Engine & Usage Limits/Quota | `cost.ts` | §64, §65, §66 |
| Approval Center (AI + human handoff) | `approval.ts` | §34, §35 |
| Search Engine (semantic + keyword + metadata) | `search.ts` | §48 |
| Model Ensembles | `ensemble.ts` | §12 |
| Privacy Modes & Data-Policy Display | `privacy.ts` | §67, §68 |
| Feature Flags | `featureflags.ts` | §99 |
| Professional Package Installer | `packages.ts` | §112–114 |
| Explainability ("why this model") | `explain.ts` | §77 |
| Durable Job Queue | `jobqueue.ts` | §46 |

`OrchestrationCore` now also integrates the **Approval Center** (a permission
requirement pauses the run and surfaces a universal approval request; an
`onPermissionRequired` hook — or a human in the UI — can approve, deny, inspect
or session-grant) and **Cost tracking** (records estimated spend per run).

## Running it

A CLI and an API/dashboard server make the core executable without the full web
app. Both are powered by `sample.ts` (sample models + capabilities + a demo
executor that exercises a transient retry and a permission approval).

```bash
# Full end-to-end demo of the §122 scenario:
npx tsx bin/cli.ts demo

# Individual commands:
npx tsx bin/cli.ts plan "Research X and write a report"
npx tsx bin/cli.ts matrix
npx tsx bin/cli.ts health
npx tsx bin/cli.ts capabilities
npx tsx bin/cli.ts search "pdf"
npx tsx bin/cli.ts explain "write a function to sort"

# API + single-page dashboard:
npx tsx server.ts            # http://localhost:4789
```

The server exposes `GET /api/matrix`, `GET /api/capabilities`,
`GET /api/health`, `POST /api/plan`, `POST /api/run` and serves a dashboard at
`/` that plans/validates/runs a request through the core and visualises the task
graph, live trace and event/approval log.

## Phase 3 — full-platform breadth

The spec's remaining cross-cutting subsystems were built on top of the core and
are fully unit-tested (the `extensions2.test.ts` suite covers all of them, plus a
chaos/contract-testing harness that runs the §122 scenario under injected
failures and asserts graceful recovery):

| Subsystem | Module | Spec |
| --- | --- | --- |
| Scheduling: reliability, misfire, timezone | `scheduling.ts` | §57–§59 |
| Notification Engine (in-app/push/email/webhook) | `notifications.ts` | §47 |
| Unified Recent Activity | `activity.ts` | §49 |
| Project Workspaces + Templates + Snapshots + Import/Export | `projects.ts` | §50–§53 |
| API Platform + SDK + Webhooks (scoped keys, signature, retries) | `api.ts` | §54–§56 |
| Workflow Builder + Templates + Debugger | `workflows.ts` | §42–§44 |
| Security Center | `security-center.ts` | §69 |
| Internationalization (10 locales, fallback) | `i18n.ts` | §72 |
| Autonomy Levels + Internal Agent Roles | `autonomy.ts` | §79–§82 |
| Marketplace Trust + Verified Publishers + Reporting | `marketplace.ts` | §104–§106 |
| Safe Update System (backup→update→health→rollback) | `updates.ts` | §102–§103 |
| Adaptive / Unified Home UI (beginner→expert) | `adaptive-ui.ts` | §115–§119 |
| Chaos / Contract / Testing Matrix | `chaos.ts` | §95–§98 |

## Running it

```bash
# Full end-to-end demo of the §122 scenario:
npx tsx bin/cli.ts demo
# Chaos testing — run the platform under injected failures:
npx tsx bin/cli.ts chaos
# Workflow builder — compile + run a workflow through the core:
npx tsx bin/cli.ts workflow

# API + single-page dashboard:
npx tsx server.ts            # http://localhost:4789
```

The server additionally exposes `POST /api/chaos` and `POST /api/workflow`
(besides `POST /api/plan`, `POST /api/run`, `GET /api/matrix`,
`GET /api/capabilities`, `GET /api/health`), and the dashboard visualises
scheduling, workflows and chaos results alongside the task graph, trace and events.

## Phase 4 — surfaces, storage, adapters and the assembled Platform

The substrate now has the actual product surfaces built on top of it, plus the
persistence and adapter layers the spec requires (§121: Storage; §96: contract
testing). All are unit-tested in `surfaces.test.ts` (125 tests total).

| Layer | Module | Spec |
| --- | --- | --- |
| Storage / persistence | `storage.ts` | §121, §8 |
| Chat / Library / Studio / Coder services | `surfaces.ts` | §115, §120 |
| Scheduler service (runs due jobs via core) | `surfaces.ts` | §57–§59 |
| Model / Workflow / Plugin / MCP managers | `surfaces.ts` | §54, §42, §39, §40 |
| Search service | `surfaces.ts` | §48 |
| Model / Plugin / MCP adapters + contract tests | `adapters.ts` | §96 |
| Platform facade (ONE AI STUDIO assembled) | `platform.ts` | §120, §121 |

Every surface is a thin service that plans/validates/runs through
`OrchestrationCore`, so they all share identity, context, compatibility,
execution, permission, security, storage, observability and events — exactly the
"build on the core, not as separate apps" rule (§121). The `Platform` object
wires the core + storage + all surfaces + adapters into one facade and is exposed
via the CLI (`tsx bin/cli.ts platform`) and the server
(`GET /api/platform/status`, `POST /api/platform/chat`).

## Phase 5 — the Unified AI Studio web application

The substrate now has a real, runnable product UI. `src/web.ts` is a Node-free,
fully-tested module of pure request handlers + page renderers; `server.ts` is a
thin adapter (HTTP + file I/O) that wires it to the core. State persists to a
JSON file via the `Storage` abstraction, so Library items, schedules and chats
survive restarts.

Run it:

```bash
npx tsx server.ts            # http://localhost:4789
```

Surfaces exposed as pages + JSON APIs:

| Page | API | Spec |
| --- | --- | --- |
| Home / Dashboard | `GET /api/status` | §115, §120 |
| Chat (universal entry) | `POST /api/chat` | §121/§122 |
| Library | `GET/POST /api/library` | §48, §50 |
| Models | `GET /api/models` | §11 |
| Workflows | `GET /api/workflows/templates`, `POST /api/workflows/run` | §42–§44 |
| Schedules | `GET/POST /api/schedules` | §57–§59 |
| Security Center | `GET /api/security` | §69 |
| Packages / Marketplace | `POST /api/plugins` | §104–§106 |
| Settings (i18n preview) | `GET /api/i18n` | §72 |
| Chaos | `POST /api/chaos` | §95–§98 |

A minimal auth scaffold (`SecurityCenter` sessions + scoped `APIKeyManager`)
gates the product; the default key is open for local/demo use and should be
enforced by a reverse proxy in production.

## What this proves

The platform is realised as **one core** with surfaces built on top: a single
`OrchestrationCore` drives capability discovery, compatibility analysis, task
graph construction, the explicit state machine, resumable execution, permission
handoff, cost accounting, tracing and events — and the CLI/server demonstrate
the entire §122 request executing as one continuous operation rather than seven
separate apps.
