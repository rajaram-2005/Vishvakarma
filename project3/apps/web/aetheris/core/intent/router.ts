/**
 * Intent → Capability routing.
 *   User Intent → Intent Analysis → Capability Search → Tool/Agent/Mode Selection → (manual override)
 * Deterministic, local, instant (no model call): a rule-based classifier over the command plus a
 * registry search. The result is a *recommendation* the UI/agents act on; users can override.
 */
import { scoreCapability, searchCapabilities } from "../capabilities/registry";
import type { Capability } from "../capabilities/types";

export type TaskType = "code" | "github" | "research" | "documents" | "study" | "media" | "voice" | "automation" | "device" | "robot" | "data" | "math" | "writing" | "translate" | "ethics" | "general";
export interface IntentPlan { task: TaskType; confidence: number; mode: string; agents: string[]; connectors: string[]; needs: { vision?: boolean; web?: boolean; knowledge?: boolean; confirmation?: boolean; physical?: boolean }; capabilities: Capability[]; explanation: string; override: { modes: string[]; hint: string } }

const RULES: { task: TaskType; re: RegExp; mode: string; agents: string[]; needs?: IntentPlan["needs"] }[] = [
  { task: "device", re: /\b(esp32|arduino|raspberry|stm32|sensor|mqtt|modbus|opc.?ua|plc|scada|actuator|relay|servo|firmware|telemetry|iot)\b/i, mode: "control", agents: ["coder"], needs: { physical: true, confirmation: true } },
  { task: "robot", re: /\b(ros ?2?|robots?|drone|slam|trajectory|manipulator|robotic arm|turtlebot|rover|quadruped|gripper|nav2|moveit|obstacle)\b/i, mode: "control", agents: ["coder"], needs: { physical: true, confirmation: true } },
  { task: "github", re: /\b(github|pull request|\bpr\b|repo(sitory)?|commit|branch|ci\b|actions workflow|issue #?\d+)\b/i, mode: "factory", agents: ["coder", "reviewer"], needs: { confirmation: true } },
  { task: "ethics", re: /\b(ethics?|ethical|moral|bias|fairness|responsible ai|impact assessment|privacy risk|surveillance|should (we|i|society)|is it (right|wrong|ok|okay|fair))\b/i, mode: "chat", agents: ["ai-ethics"] },
  { task: "math", re: /\b(solve|integral|derivative|equation|theorem|proofs?|prove|probability|matrix|irrational|prime|calculus|algebra|geometry|lemma)\b|[∫∑√]|\d+\s*[x×]\s*\d+/i, mode: "chat", agents: ["math"] },
  { task: "study", re: /\b(quiz(zes)?|flashcards?|revise|revision|exam|test me|study plan|spaced repetition|mock test|worksheet|for class \d+|grade \d+|syllabus|lesson plan|teach me)\b/i, mode: "study", agents: ["tutor"] },
  { task: "code", re: /\b(code|function|bug|debug|refactor|compile|typescript|python|javascript|java|rust|golang|sql|api|stack ?trace|error:|exception|unit test)\b/i, mode: "chat", agents: ["coder"] },
  { task: "automation", re: /\b(every ((\d+ )?(day|morning|evening|night|week|month|hour|minute)s?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday)|daily|weekly|monthly|hourly|schedule|remind me|automat(e|ion)|cron|workflow|whenever|when .* (happens|exceeds|drops|arrives)|trigger|digest|alert me)\b/i, mode: "schedules", agents: [] },
  { task: "research", re: /\b(research|literature|papers?|arxiv|cite|citations?|survey|state of the art|compare .* (models|approaches)|deep dive)\b/i, mode: "chat", agents: ["researcher"], needs: { web: true } },
  { task: "documents", re: /\b(this (pdf|document|file|contract|report)|in my (notes|documents|files)|knowledge base|summari[sz]e the (attached|uploaded)|according to the document)\b/i, mode: "docs", agents: ["analyst"], needs: { knowledge: true } },
  { task: "media", re: /\b(generate|create|make|draw) (an? )?(image|picture|logo|poster|illustration|video|song|voice ?over)\b|\btext.to.(image|speech|video)\b/i, mode: "studio", agents: ["designer"] },
  { task: "voice", re: /\b(voice mode|talk to me|read (it|this) aloud|speak)\b/i, mode: "voice", agents: [] },
  { task: "data", re: /\b(csv|spreadsheet|dataset|dataframe|pandas|chart|plot|statistics|regression|forecast)\b/i, mode: "chat", agents: ["data-scientist", "analyst"] },
  { task: "translate", re: /\b(translate|in tamil|in hindi|தமிழில்|हिंदी में|to english)\b/i, mode: "chat", agents: ["polyglot"] },
  { task: "writing", re: /\b(write|draft|essay|email|blog|cover letter|resume|rewrite|proofread|story|poem)\b/i, mode: "chat", agents: ["writer"] },
];
const MODES = ["chat", "agents", "factory", "studio", "docs", "study", "schedules", "workflows", "learn", "apps", "voice"];

export async function routeIntent(text: string, opts: { hasImages?: boolean; hasKb?: boolean } = {}): Promise<IntentPlan> {
  const t = text.trim();
  const mention = /^@([\w-]+)/.exec(t)?.[1]; const slash = /^\/(\w+)/.exec(t)?.[1];
  let hit = RULES.find((r) => r.re.test(t));
  let confidence = hit ? 0.7 : 0.35;
  if (!hit) hit = { task: "general", re: /./, mode: "chat", agents: ["hermes"] };
  if (t.length > 400 && hit.task !== "documents") confidence -= 0.1;
  if (opts.hasImages) confidence = Math.max(confidence, 0.6);
  const caps = await searchCapabilities({ q: t.slice(0, 300), status: ["implemented", "partial", "experimental"], limit: 8 });
  const connectors = caps.filter((c) => (c.category === "connector" || c.category === "tool") && scoreCapability(c, t) >= 6).slice(0, 3).map((c) => c.id);
  const agents = mention ? [mention] : hit.agents;
  const needs: IntentPlan["needs"] = { ...hit.needs, vision: opts.hasImages || undefined, knowledge: hit.needs?.knowledge || opts.hasKb || undefined };
  const physicalNote = needs.physical ? " Physical-AI adapters are not available in this build: Aetheris can design firmware/wiring/protocol code and safety checks but cannot connect to hardware." : "";
  return {
    task: hit.task, confidence: Math.round(confidence * 100) / 100, mode: slash && MODES.includes(slash) ? slash : hit.mode, agents, connectors, needs, capabilities: caps,
    explanation: `Classified as ${hit.task} (${Math.round(confidence * 100)}%). ${agents.length ? `Suggested agent${agents.length > 1 ? "s" : ""}: ${agents.map((a) => "@" + a).join(", ")}.` : ""}${connectors.length ? ` Relevant connectors: ${connectors.join(", ")}.` : ""}${needs.confirmation ? " Write actions will ask for confirmation." : ""}${physicalNote}`.trim(),
    override: { modes: MODES, hint: "Prefix with @agent to force a specialist, or /mode to force a surface." },
  };
}
