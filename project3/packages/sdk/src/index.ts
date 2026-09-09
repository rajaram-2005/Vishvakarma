// SUTRA SDK — one facade over the whole stack.
// Apps (web, desktop, mobile) call this; the adapters underneath stay
// provider-neutral and local-first.

import type { ModelInfo } from '@sutra/shared';
import { route, type ChatProvider, type RouteDecision } from '@sutra/model-adapters';
import { createKVStore, puterSignedIn, connectPuter, PUTER_DOC_URL } from '@sutra/puter-adapter';
import { validateWorkflow, toN8nJson, type WfWorkflow } from '@sutra/workflow-sdk';
import { smokeSuite, runEvalSuite, computeMetrics, type EvalTask, type TaskResult } from '@sutra/evaluation-sdk';
import { createGateway, type ToolCall, type ToolGateway } from '@sutra/tool-adapters';

export interface AskResult {
  text: string;
  model: string;
  decision: RouteDecision;
}

export interface SutraClient {
  /** Request → Task Analysis → Model Ranking → Model → Result */
  route(text: string, opts?: { requireLocal?: boolean; forceModel?: string }): RouteDecision;
  ask(text: string, opts?: { requireLocal?: boolean; forceModel?: string }): Promise<AskResult>;
  kv: ReturnType<typeof createKVStore>;
  tools: ToolGateway;
  workflow: {
    validate(wf: WfWorkflow): string[];
    exportN8n(wf: WfWorkflow): string;
  };
  evaluation: {
    smokeSuite(): EvalTask[];
    run(provider: ChatProvider, tasks?: EvalTask[]): Promise<TaskResult[]>;
    metrics(results: TaskResult[], costIn: number, costOut: number, second?: TaskResult[]): ReturnType<typeof computeMetrics>;
  };
  puter: {
    signedIn(): boolean;
    connect(): Promise<{ ok: boolean; user?: string }>;
    docsUrl: string;
  };
}

export function createSutra(
  models: ModelInfo[],
  providerFor: (m: ModelInfo) => ChatProvider | null,
): SutraClient {
  return {
    route: (text, opts) => route(models, text, opts),

    async ask(text, opts) {
      const decision = route(models, text, opts);
      const provider = decision.chosen ? providerFor(decision.chosen) : null;
      if (!provider) {
        return {
          text: 'No model is currently reachable. SUTRA Local is always available — check Settings → Providers.',
          model: 'none',
          decision,
        };
      }
      let out = '';
      await provider.chat({ messages: [{ role: 'user', content: text }] }, (c) => {
        if (!c.done) out += c.text;
      });
      return { text: out, model: provider.modelId, decision };
    },

    kv: createKVStore(),
    tools: createGateway(),
    workflow: { validate: validateWorkflow, exportN8n: toN8nJson },
    evaluation: {
      smokeSuite,
      run: (provider, tasks) => runEvalSuite(provider, tasks ?? smokeSuite()),
      metrics: (results, ci, co, second) => computeMetrics(results, ci, co, second),
    },
    puter: { signedIn: puterSignedIn, connect: connectPuter, docsUrl: PUTER_DOC_URL },
  };
}

export type { ToolCall, ChatProvider, RouteDecision, EvalTask, TaskResult, WfWorkflow };
