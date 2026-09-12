// §95 / §96 / §97 / §98 — Testing Matrix, Contract Testing and Chaos Testing.
//
// A chaos harness that injects failures (model/plugin/MCP down, network loss,
// invalid credentials/input, timeout, rate limit, DB restart) into a node
// executor, then runs the request through the core. The platform should recover
// gracefully — retry, pause, fail cleanly and cascade — rather than crash.

import { OrchestrationCore } from './core';
import type { CompatibilityContext, NodeExecutor } from './types';

export type ChaosScenario =
  | 'model-down'
  | 'plugin-down'
  | 'mcp-down'
  | 'network-loss'
  | 'invalid-credentials'
  | 'invalid-input'
  | 'timeout'
  | 'rate-limit'
  | 'db-restart';

export interface ChaosConfig {
  scenario: ChaosScenario;
  /** Node id to target; if omitted, the first node is targeted. */
  targetNode?: string;
  /** Fail this many times before letting the underlying executor succeed. */
  failUntilAttempt?: number;
}

/** Wrap an executor so a target node fails with a scenario-specific error. */
export function chaosExecutor(underlying: NodeExecutor, config: ChaosConfig): NodeExecutor {
  let attempts = 0;
  return {
    async execute(node, ctx) {
      const isTarget = !config.targetNode || node.id === config.targetNode;
      if (isTarget) {
        attempts += 1;
        if (attempts <= (config.failUntilAttempt ?? 1)) {
          switch (config.scenario) {
            case 'invalid-credentials':
              throw Object.assign(new Error('401 invalid credentials'), { kind: 'auth' });
            case 'rate-limit':
              throw Object.assign(new Error('429 rate limited'), { kind: 'rate-limit' });
            default:
              throw new Error(`${config.scenario}: ${node.id} unavailable`);
          }
        }
      }
      return underlying.execute(node, ctx);
    },
  };
}

export interface ChaosOutcome {
  scenario: ChaosScenario;
  failed: string[];
  completed: string[];
  /** Whether the run finished without throwing (graceful = true). */
  graceful: boolean;
}

/** Run one chaos scenario against a request and report the outcome. */
export async function runChaos(
  core: OrchestrationCore,
  text: string,
  scenario: ChaosScenario,
  ctx: CompatibilityContext = { offline: false, privacyMode: 'cloud', grantedPermissions: ['*'] },
): Promise<ChaosOutcome> {
  const { graph } = core.plan(text);
  const base: NodeExecutor = {
    async execute(node) {
      return { result: `ok:${node.id}`, evidence: [] };
    },
  };
  const result = await core.run(graph, chaosExecutor(base, { scenario, targetNode: 'report' }), { context: ctx });
  return { scenario, failed: result.failed, completed: result.completed, graceful: true };
}
