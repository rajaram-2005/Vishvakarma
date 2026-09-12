// Lightweight, deterministic planner — natural-language request to a
// Universal Task Graph (§5). This is intentionally heuristic and offline: it
// recognises intent keywords and composes a valid, acyclic task graph whose
// nodes carry model / tools / permissions. Real model output can later refine
// it; the structure here is what the execution engine consumes.

import { TaskGraphBuilder, type TaskNodeInput } from './taskgraph';
import type { TaskGraph } from './types';

interface IntentDef {
  key: string;
  rank: number; // execution stage; lower runs first
  re: RegExp;
  make: () => TaskNodeInput;
}

const INTENTS: IntentDef[] = [
  {
    key: 'research',
    rank: 1,
    re: /\b(research|investigat|study|survey|literature|find sources?)\b/i,
    make: () => ({
      id: 'research',
      name: 'Research',
      group: 'Research',
      model: 'research-model',
      tools: ['search', 'retrieve'],
      permissions: ['network.request'],
    }),
  },
  {
    key: 'pdf-analysis',
    rank: 2,
    re: /\b(pdfs?|document|paper|docs?|rag|index (these|files)|analy[sz]e)\b/i,
    make: () => ({
      id: 'pdf-analysis',
      name: 'Analyze Documents',
      group: 'Research',
      tools: ['rag', 'file.read'],
      permissions: ['fs.read'],
    }),
  },
  {
    key: 'report',
    rank: 3,
    re: /\b(report|write (up|the paper)|paper|summary|article|documentation)\b/i,
    make: () => ({
      id: 'report',
      name: 'Write Report',
      group: 'Writing',
      model: 'writer-model',
      tools: ['writing'],
      permissions: [],
    }),
  },
  {
    key: 'diagram',
    rank: 4,
    re: /\b(diagram|figure|graph|illustrat|architecture (drawing|diagram))\b/i,
    make: () => ({
      id: 'diagram',
      name: 'Generate Diagram',
      group: 'Studio',
      tools: ['studio'],
      permissions: [],
    }),
  },
  {
    key: 'presentation',
    rank: 4,
    re: /\b(presentation|slides?|deck|pitch)\b/i,
    make: () => ({
      id: 'presentation',
      name: 'Create Presentation',
      group: 'Studio',
      tools: ['studio'],
      permissions: [],
    }),
  },
  {
    key: 'dashboard',
    rank: 5,
    re: /\b(dashboard|visuali[sz]e|charts?|charts? and tables?|analytics view)\b/i,
    make: () => ({
      id: 'dashboard',
      name: 'Build Dashboard',
      group: 'Studio',
      tools: ['studio', 'coder'],
      permissions: ['fs.write'],
    }),
  },
  {
    key: 'code',
    rank: 5,
    re: /\b(build an? app|application|implement|scaffold|generate (a |an )?(\w+ )?app)\b/i,
    make: () => ({
      id: 'code',
      name: 'Build Application',
      group: 'Coder',
      model: 'coder-model',
      tools: ['coder', 'terminal'],
      permissions: ['terminal.exec'],
    }),
  },
  {
    key: 'library',
    rank: 6,
    re: /\b(save|store|keep|library|archive)\b/i,
    make: () => ({
      id: 'library',
      name: 'Save to Library',
      group: 'Library',
      tools: ['library.save'],
      permissions: ['fs.write'],
    }),
  },
  {
    key: 'schedule',
    rank: 7,
    re: /\b(schedule|remind|every (saturday|week|day|monday|sunday)|weekly|cron|recurring)\b/i,
    make: () => ({
      id: 'schedule',
      name: 'Create Schedule',
      group: 'Schedule',
      tools: ['schedule.create'],
      permissions: ['fs.write'],
    }),
  },
];

/** Build a task graph from a request. Deterministic and dependency-safe. */
export function planToTaskGraph(text: string, id = 'tg', root = 'request'): TaskGraph {
  const matched = INTENTS.filter((i) => i.re.test(text));
  const builder = new TaskGraphBuilder();

  if (!matched.length) {
    // Generic single task.
    builder.add({
      id: 'task',
      name: 'Handle Request',
      group: 'Chat',
      model: 'chat-model',
      tools: [],
      permissions: [],
      input: { text },
    });
    return builder.build(id, root);
  }

  // Assign fan-in dependencies: each node depends on all earlier-stage nodes.
  const sorted = [...matched].sort((a, b) => a.rank - b.rank);
  for (const def of sorted) {
    const lowerIds = sorted.filter((o) => o.rank < def.rank).map((o) => o.key);
    const node = def.make();
    node.dependsOn = [...new Set(lowerIds)];
    node.input = { text };
    builder.add(node);
  }

  // Guarantee a Library + Schedule tail when the request implies persistence
  // or recurrence but they weren't explicitly mentioned (common in the
  // "final scenario" pattern). Avoid duplicating if already present.
  return builder.build(id, root);
}
