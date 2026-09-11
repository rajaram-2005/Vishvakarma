import { AGENTS } from "@/aetheris/lib/agents/catalog";
import { allProviders } from "@/aetheris/lib/router/providers";
import { CONNECTORS, CATEGORIES } from "@/aetheris/lib/mcp/catalog";
import { MODEL_TIERS } from "@/aetheris/lib/models/tiers";
import { COMMANDS } from "@/aetheris/lib/commands";
import { TEMPLATES } from "@/aetheris/lib/workflows/engine";
import type { Guide } from "./guides";
import { CONCEPTS, GROUP_LABEL, conceptMarkdown, type ConceptGroup } from "@/aetheris/lib/concepts";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Reference pages generated from the live catalogs. */
export function referencePages(): Guide[] {
  const domains = Array.from(new Set(AGENTS.map((a) => a.domain)));
  const agents = `
${AGENTS.length} agents. Force any of them with \`@id\` or an alias; Prime picks automatically otherwise.

${domains.map((d) => {
  const list = AGENTS.filter((a) => a.domain === d);
  return `## ${d} (${list.length})\n\n| Agent | Mention | Tier | Skills | Aliases |\n| --- | --- | --- | --- | --- |\n${list.map((a) => `| ${a.icon} **${a.name}** — ${esc(a.description)} | \`@${a.id}\` | ${a.tier} | ${esc(a.skills.join(", "))} | ${(a.aliases ?? []).map((x) => `\`${x}\``).join(" ")} |`).join("\n")}`;
}).join("\n\n")}
`;

  const providers = `
${allProviders().length} providers. Lower priority number = tried first. Keyless providers work with no key at all.

| Provider | Priority | Default model | Free tier | Vision | Get a key |
| --- | --- | --- | --- | --- | --- |
${allProviders().slice().sort((a, b) => a.priority - b.priority).map((p) => `| **${p.name}** (\`${p.id}\`)${p.keyless ? " · keyless" : ""} | P${p.priority} | \`${esc(p.model)}\` | ${esc(p.freeTier ?? "—")} | ${p.vision ? "✓" : ""} | ${p.keyUrl ? `[key](${p.keyUrl})` : "—"} |`).join("\n")}

## Model tiers (policies)
| Tier | Providers | Max tokens | Agents | Keyless ok |
| --- | --- | --- | --- | --- |
${MODEL_TIERS.map((t) => `| \`${t.id}\` — ${esc(t.description)} | ${t.providers.length ? t.providers.join(", ") : "any"} | ${t.maxTokens} | up to ${t.agents.max}${t.agents.parallel ? ", parallel" : ""}${t.agents.critique ? ", Metis critique" : ""} | ${t.allowKeyless ? "✓" : ""} |`).join("\n")}
`;

  const connectors = `
${CONNECTORS.length} connectors across ${CATEGORIES.length} categories. *remote* = hosted by the vendor (MCP over HTTP); *gateway* = served by Aetheris.

${CATEGORIES.map((c) => {
  const list = CONNECTORS.filter((x) => x.category === c.id);
  if (!list.length) return "";
  return `## ${c.label} (${list.length})\n\n| Connector | Kind | Auth | Endpoint |\n| --- | --- | --- | --- |\n${list.map((x) => `| **${x.name}** — ${esc(x.description)} | ${x.kind}${x.premium ? " · premium" : ""} | ${x.oauth ? "OAuth" : x.auth ? esc(x.auth.label) : "none"} | \`${esc(x.url)}\` |`).join("\n")}`;
}).filter(Boolean).join("\n\n")}
`;

  const commands = `
Type \`/\` at the start of the composer.

| Command | Does |
| --- | --- |
${COMMANDS.map((c) => `| \`${c.label}\` | ${c.icon} ${esc(c.hint)} |`).join("\n")}

## Workflow templates
| Template | Steps | Input |
| --- | --- | --- |
${TEMPLATES.map((t) => `| **${t.name}** — ${esc(t.description)} | ${t.steps.map((s) => s.agent ? `@${s.agent}` : s.kind).join(" → ")} | ${esc(t.inputLabel)} |`).join("\n")}
`;

  const endpoints = `
All routes live under \`src/app/api\`. Auth: cookie session (browser) or \`Authorization: Bearer sk-aeth-…\` where noted.

| Method & path | Purpose |
| --- | --- |
| \`POST /api/chat\` | Streamed chat through the router (SSE), optionally using a server-resolved character id and mode. |
| \`GET/POST /api/characters\` · \`GET/PATCH/DELETE /api/characters/:id\` | Curated personas and private character CRUD. |
| \`POST /api/agents/run\` · \`GET /api/agents\` | Orchestrated multi-agent run · roster. |
| \`POST /api/research\` | Deep research (SSE). |
| \`POST /api/arena\` | Multi-provider comparison. |
| \`POST /api/debate\` | Debate with Metis verdict (SSE). |
| \`GET/POST /api/workflows\`, \`GET/DELETE /api/workflows/:id\`, \`POST /api/workflows/:id/run\` | Workflows. |
| \`POST /api/factory\` | GitHub coding factory (SSE). |
| \`POST /api/media/*\` | Image / speech / video. |
| \`GET /api/mcp/catalog\`, \`POST /api/mcp/*\` | Connectors; \`/api/mcp/hub\` is the MCP Streamable-HTTP hub (Bearer key). |
| \`POST /api/v1/chat/completions\`, \`GET /api/v1/models\` | OpenAI-compatible API (Bearer key). |
| \`GET/POST /api/rooms\`, \`GET /api/rooms/:id\`, \`GET /api/rooms/:id/events\`, \`POST /api/rooms/:id/messages\` | Live rooms. |
| \`POST/DELETE /api/share\`, \`GET /api/share/:id\` | Read-only chat snapshots on the local instance. |
| \`GET/PUT/DELETE /api/sync\` | Legacy account sync within the local instance. |
| \`GET/POST /api/gallery\`, \`POST/DELETE /api/gallery/:id\` | Prompt gallery. |
| \`GET/DELETE /api/auth/session\`, \`/api/auth/{google,github}\`, \`POST /api/auth/guest\` | OAuth integrations and legacy account compatibility endpoints; the web shell is anonymous-first. |
| \`GET/POST/DELETE /api/keys\` | Personal API keys. |
| \`GET /api/providers\`, \`POST /api/providers/keys\` | Mesh status and BYOK. |
| \`GET /api/billing/plans\` | Plan/usage/user snapshot (always free-for-all by default). |
| \`GET/POST /api/admin/{users,payments}\` | Admin. |
`;

  const groups = Object.keys(GROUP_LABEL) as ConceptGroup[];
  const conceptsIndex = `
Plain-language explanations of ${CONCEPTS.length} AI concepts and AI-ethics topics — each with an analogy, why it matters in Aetheris, a common misconception, and a prompt to try. Also available as \`GET /api/concepts\` and the **📚 Learn** view, and used to ground the AI Explainer and AI Ethicist.

${groups.map((g) => `## ${GROUP_LABEL[g]}\n\n${CONCEPTS.filter((c) => c.group === g).map((c) => `- [**${c.term}**](/docs/concept-${c.id}) — ${esc(c.short)}`).join("\n")}`).join("\n\n")}
`;
  const conceptPages: Guide[] = CONCEPTS.map((c) => ({ slug: `concept-${c.id}`, section: "Explained AI", title: c.term, body: conceptMarkdown(c) }));

  return [
    { slug: "concepts", section: "Explained AI", title: `Explained AI — ${CONCEPTS.length} concepts`, body: conceptsIndex },
    ...conceptPages,
    { slug: "ref-agents", section: "Reference", title: `Agents (${AGENTS.length})`, body: agents },
    { slug: "ref-providers", section: "Reference", title: `Providers (${allProviders().length})`, body: providers },
    { slug: "ref-connectors", section: "Reference", title: `MCP connectors (${CONNECTORS.length})`, body: connectors },
    { slug: "ref-commands", section: "Reference", title: "Commands & templates", body: commands },
    { slug: "ref-endpoints", section: "Reference", title: "HTTP endpoints", body: endpoints },
  ];
}
