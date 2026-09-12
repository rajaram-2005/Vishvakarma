#!/usr/bin/env tsx
// @sutra/orchestration — command-line demo of the Unified AI Studio ONE CORE.
//
//   tsx bin/cli.ts demo
//   tsx bin/cli.ts plan "Research X and write a report"
//   tsx bin/cli.ts matrix
//   tsx bin/cli.ts health
//   tsx bin/cli.ts capabilities
//   tsx bin/cli.ts search "pdf"
//   tsx bin/cli.ts explain "write a function to sort"
//
// The `demo` command runs the full §122 scenario: plan -> compatibility ->
// execution engine (with a transient retry + a permission approval) -> events
// -> trace -> cost, then prints the result and the offline/online matrix.

import {
  OrchestrationCore,
  HealthRegistry,
  CostEngine,
  searchSample,
  explainModelChoice,
  runChaos,
  WORKFLOW_TEMPLATES,
  runWorkflow,
  CAPABILITY_MATRIX,
  sampleModels,
  buildSampleCore,
  sampleContext,
  demoExecutor,
  SAMPLE_REQUEST,
} from '../src/index';

function line(s = '') {
  process.stdout.write(s + '\n');
}
function header(t: string) {
  line('\n=== ' + t + ' ===');
}

async function runDemo(): Promise<void> {
  const core = buildSampleCore();
  header('PLAN (§5/§122)');
  const { graph } = core.plan(SAMPLE_REQUEST);
  for (const n of Object.values(graph.nodes)) {
    line(`  • ${n.name} [${n.group ?? '-'}] deps=[${n.dependsOn.join(', ')}]`);
  }

  header('COMPATIBILITY (§3)');
  const reports = core.validatePlan(graph, sampleContext);
  let allOk = true;
  for (const [id, r] of reports) {
    line(`  • ${id}: ${r.compatible ? 'OK' : 'INCOMPATIBLE ' + r.reasons.join('; ')}`);
    if (!r.compatible) allOk = false;
  }

  header('EXECUTION (§7/§8/§45/§63)');
  const events: string[] = [];
  core.bus.onAny((name) => events.push(name));
  const cost = new CostEngine();
  const result = await core.run(graph, demoExecutor(), {
    context: sampleContext,
    pauseForPermission: true,
    onPermissionRequired: async (req) => {
      line(`    ⚠ permission required: ${req.permission} (risk ${req.risk}) -> auto-approving`);
      return 'approve-once';
    },
    costEngine: cost,
    costScope: 'user:demo',
  });

  header('RESULT');
  line(`  completed: ${result.completed.join(', ')}`);
  line(`  failed: ${result.failed.join(', ') || 'none'}`);
  line(`  paused: ${result.paused ?? 'none'}`);
  line(`  trace spans: ${result.trace.spans.length}`);
  line(`  approvals: ${core.approvalCenter.list('approved').length} approved`);
  line(`  estimated cost: $${cost.total().toFixed(4)}`);
  line(`  events: ${events.join(' → ')}`);

  header('MODEL ROUTING (§11)');
  const pick = explainModelChoice(sampleModels(), 'balanced', 'write a function to sort', { privacyMode: 'cloud' });
  line(`  balanced -> ${pick.chosen?.id} (${pick.reasons.join('; ')})`);

  header('OFFLINE/ONLINE MATRIX (§60)');
  for (const r of CAPABILITY_MATRIX.slice(0, 6)) {
    line(`  • ${r.capability.padEnd(18)} online=${r.online} offline=${r.offline}`);
  }
  line('  …');
  void allOk;
  line('\nDone. The ONE CORE executed the entire request as one continuous operation.');
}

function runPlan(text: string): void {
  const core = buildSampleCore();
  const { graph } = core.plan(text);
  header('PLANNED TASK GRAPH');
  for (const n of Object.values(graph.nodes)) {
    line(`  • ${n.name} [${n.group ?? '-'}] deps=[${n.dependsOn.join(', ')}]`);
  }
}

function runMatrix(): void {
  header('OFFLINE/ONLINE CAPABILITY MATRIX (§60)');
  for (const r of CAPABILITY_MATRIX) {
    line(`  • ${r.capability.padEnd(20)} online=${String(r.online).padEnd(18)} offline=${r.offline}`);
  }
}

function runHealth(): void {
  const h = new HealthRegistry();
  h.recordSuccess('a', 12);
  h.recordError('b');
  h.recordError('b');
  h.recordError('b');
  header('PROVIDER HEALTH (§10)');
  for (const [id, s] of Object.entries(h.summary())) {
    line(`  • ${id}: ${s.status} (errRate ${s.errorRate.toFixed(2)})`);
  }
}

function runCapabilities(): void {
  const core = buildSampleCore();
  header('REGISTERED CAPABILITIES');
  for (const c of core.registry.all()) {
    line(`  • ${c.id}@${c.version} (${c.type}) perms=[${c.permissions.join(',')}] net=${c.network}`);
  }
}

function runSearch(q: string): void {
  header(`SEARCH (§48): "${q}"`);
  const hits = searchSample(q);
  for (const hit of hits) line(`  • [${hit.kind}] ${hit.doc.title} (${hit.score.toFixed(2)})`);
}

function runExplain(text: string): void {
  header('EXPLAINABILITY (§77)');
  const ex = explainModelChoice(sampleModels(), 'quality', text, { privacyMode: 'cloud' });
  line(`  task type: ${ex.taskType}`);
  line(`  chosen: ${ex.chosen?.id}`);
  for (const r of ex.reasons) line(`    - ${r}`);
}

async function runChaosDemo(): Promise<void> {
  const core = buildSampleCore();
  header('CHAOS TESTING (§95-§98)');
  for (const scenario of ['model-down', 'network-loss', 'invalid-credentials', 'rate-limit', 'db-restart'] as const) {
    const out = await runChaos(core, SAMPLE_REQUEST, scenario, sampleContext);
    line(`  • ${scenario.padEnd(22)} graceful=${out.graceful} completed=${out.completed.length} failed=${out.failed.length}`);
  }
}

async function runWorkflowCmd(): Promise<void> {
  const core = buildSampleCore();
  const wf = WORKFLOW_TEMPLATES[0].build();
  header('WORKFLOW BUILDER (§42-§44)');
  const { debug } = await runWorkflow(core, wf, demoExecutor(), { context: sampleContext });
  for (const d of debug) line(`  • ${d.name}: ${d.status}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'plan':
      runPlan(rest.join(' ') || SAMPLE_REQUEST);
      break;
    case 'matrix':
      runMatrix();
      break;
    case 'health':
      runHealth();
      break;
    case 'capabilities':
      runCapabilities();
      break;
    case 'search':
      runSearch(rest.join(' ') || 'pdf');
      break;
    case 'explain':
      runExplain(rest.join(' ') || 'write a function to sort');
      break;
    case 'chaos':
      await runChaosDemo();
      break;
    case 'workflow':
      await runWorkflowCmd();
      break;
    case 'demo':
    case undefined:
    default:
      await runDemo();
      break;
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n');
  process.exit(1);
});
