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

## What this proves

The platform is realised as **one core** with surfaces built on top: a single
`OrchestrationCore` drives capability discovery, compatibility analysis, task
graph construction, the explicit state machine, resumable execution, permission
handoff, cost accounting, tracing and events — and the CLI/server demonstrate
the entire §122 request executing as one continuous operation rather than seven
separate apps.
