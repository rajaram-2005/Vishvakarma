/**
 * RAVANA · Intent Analyzer + Task Classifier (spec §3, §29).
 *
 *   User text (+images) → intent analysis → task classification → kind + needs + depth hint
 *
 * Deterministic, local and instant (no model call), mirroring the platform's intent router
 * philosophy: the classifier is a router input, not a bottleneck. It decides:
 *   • kind            — which reasoning path the engine takes
 *   • needs           — vision? web? tools? sandboxed execution? long context?
 *   • planDepth       — "chat" gets a shallow linear plan, "build" gets a deep DAG
 *   • kindReason      — human-readable explanation of the decision (execution trace)
 */
import type { RavanaKind, RavanaPriority } from "./types";

export interface RavanaNeeds {
  vision: boolean;
  web: boolean;
  tools: boolean;
  sandbox: boolean;
  longContext: boolean;
  highStakes: boolean;
}

export interface RavanaClassified {
  kind: RavanaKind;
  kindReason: string;
  priority: RavanaPriority;
  needs: RavanaNeeds;
  planDepth: "shallow" | "deep";
}

interface Rule {
  kind: RavanaKind;
  re: RegExp;
  reason: string;
  needs?: Partial<RavanaNeeds>;
  depth?: "shallow" | "deep";
}

/** Order matters: more specific intents are matched first. Vision is NOT decided by words alone —
 *  it requires an attached image; a phrase about an image without one gets a knowledge answer. */
const RULES: Rule[] = [
  { kind: "build", re: /\b(build|create|develop|design|implement|architect|set up|stand up|migrate|modernize|automate|pipeline|system|application|platform|end.to.end|from scratch|production)\b/i, reason: "multi-step construction objective", needs: { tools: true, sandbox: true, web: true }, depth: "deep" },
  { kind: "research", re: /\b(research|investigate|literature|papers?|compare|survey|market|state of the art|sources?|evidence|latest|trends?|find out|gather)\b/i, reason: "evidence gathering requested", needs: { web: true }, depth: "deep" },
  { kind: "coding", re: /\b(code|function|class|module|bug|debug|refactor|fix|compile|error|exception|stack ?trace|api|endpoint|middleware|test|unit test|typescript|javascript|python|java|rust|golang|sql|repo(sitory)?|auth(entication)?|crash)\b/i, reason: "software/code intent", needs: { tools: true, sandbox: true }, depth: "deep" },
  { kind: "math", re: /\b(solve|integral|derivative|equation|theorem|proofs?|prove|probability|matrix|algebra|geometry|lemma|calculate|compute|formula)\b|[∫∑√×÷±]|\b\d+\s*[x×*]\s*\d+\b/i, reason: "mathematical or numerical problem", needs: { tools: true, sandbox: true }, depth: "shallow" },
  { kind: "analysis", re: /\b(analy(s|z)e|explain|why|how does|compare|contrast|evaluate|review|critique|understand|interpret|summari[sz]e|diagnose|root cause|assess)\b/i, reason: "reasoning/explanation intent", needs: { tools: false }, depth: "shallow" },
];

/** Strings that signal a lightweight, direct question (fast path). */
const QUICK = /\b(define|meaning|what is|what are|who is|when|where|short|quick|brief|list|tell me|difference between|what's the)\b/i;
const LONG = /\b(detailed|thorough|comprehensive|in.depth|deep|long|full|step.by.step|guide|report|analysis)\b/i;
/** An image noun mentioned anywhere (used only to explain why vision is/isn't the path). */
const IMAGE_TALK = /\b(image|picture|photo(graph)?|screenshot|circuit diagram|diagram|figure|illustration|drawing|scan|visual)\b/i;

/** Deterministic classifier — pure, exported for tests. */
export function classifyTask(text: string, opts: { hasImages?: boolean; contextLength?: number } = {}): RavanaClassified {
  const t = text.slice(0, 8000);
  const hasImages = !!opts.hasImages;

  // An attached image always leads the reasoning path to the vision lane.
  if (hasImages) {
    return {
      kind: "vision",
      kindReason: "image attached — vision-capable model lane",
      priority: "normal",
      needs: { vision: true, web: false, tools: true, sandbox: false, longContext: (opts.contextLength ?? 0) > 12_000, highStakes: false },
      planDepth: "shallow",
    };
  }

  for (const r of RULES) {
    if (r.re.test(t)) {
      const needs: RavanaNeeds = {
        vision: false,
        web: false,
        tools: false,
        sandbox: false,
        longContext: (opts.contextLength ?? 0) > 12_000,
        highStakes: /(delete|remove|sudo|pay|purchase|send|post|deploy|push|commit|write to|shutdown|actuate)/i.test(t),
        ...r.needs,
      };
      const depth = r.depth ?? (QUICK.test(t) && !LONG.test(t) ? "shallow" : "deep");
      // A pasted large context always deserves at least the analysis path.
      const kind: RavanaKind = r.kind === "chat" && needs.longContext ? "analysis" : r.kind;
      const priority: RavanaPriority = needs.highStakes ? "high" : /urgent|asap|quickly|immediately|critical/i.test(t) ? "high" : "normal";
      return { kind, kindReason: r.reason, priority, needs, planDepth: depth };
    }
  }

  const talksImage = IMAGE_TALK.test(t);
  const simple = QUICK.test(t) && !LONG.test(t) && !talksImage;
  const needs: RavanaNeeds = {
    vision: false,
    web: false,
    tools: false,
    sandbox: false,
    longContext: (opts.contextLength ?? 0) > 12_000,
    highStakes: false,
  };
  return {
    kind: simple ? "chat" : "analysis",
    kindReason: talksImage && !simple ? "mentions an image but none is attached — answering from knowledge, flagging what an image would add" : simple ? "short factual question — fast path" : "general reasoning — analysis path",
    priority: "normal",
    needs,
    planDepth: simple ? "shallow" : "deep",
  };
}
