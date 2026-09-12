/**
 * Hand-written documentation. Reference pages (agents, providers, connectors, API) are generated
 * from the live catalogs in ./reference.ts so they never drift from the code.
 */
export interface Guide { slug: string; title: string; section: string; body: string }

export const GUIDES: Guide[] = [
  { slug: "start", section: "Getting started", title: "What is Aetheris One?", body: `
Aetheris One is a **free, open-source, local-only AI workspace**. Run it on your own computer in a browser or the desktop app; there is no cloud deployment step. Online providers and connected services still need internet access. One chat box in front of a mesh of free AI providers with silent failover, a hierarchy of 102 agents, a database-backed character creator, a GitHub coding factory, a media studio, a hub of 100+ MCP apps, live rooms, workflows and more.

**Everything is free for everyone.** There are no plans, credits or payments in the default local configuration. The only limits are the upstream providers' free tiers — and the router spreads your requests across all of them.

## 60-second tour
1. **Chat** — type and send. The router picks a provider; if it rate-limits, another one answers. Hover the ✦ pill to see which.
2. **@** — type \`@\` to pick one of 102 agents (\`@coder\`, \`@tutor\`, \`@tax\`…). Or just describe the task and **Prime** routes it.
3. **/** — slash commands: \`/research\`, \`/arena\`, \`/debate\`, \`/room\`, \`/share\`, \`/workflows\`…
4. **Sidebar modes** — Characters, Agents, Coding Factory, Studio, Apps, Gallery, Workflows, Providers.
5. **Start immediately** — the web app uses anonymous browser-local data; no login or display name is required.
`},
  { slug: "chat", section: "Getting started", title: "Chat, models and the provider mesh", body: `
## How routing works
Every request goes through the **omni-router** (\`src/lib/router/router.ts\`):
- Providers are ordered by priority tier (P1 fastest/most generous → P5 keyless community).
- Within a tier the order is shuffled for load-balancing, or **health-ranked** (Bayesian success rate + latency) when priority routing is on (always on now that everything is free).
- On a 429 / 5xx / timeout the router silently moves to the next provider. If tokens were already streamed, the partial answer is kept rather than restarted.
- The provider that answered is shown under each message, with latency and failover count.

## Bring your own keys
You never need a key, but adding free keys raises your limits. Open **Providers** → paste keys. Links open in a new tab (provider pages refuse to load in frames). Keys are stored sealed with \`AETHERIS_SECRET\`.

## Model tiers
**\`aetheris-one\` is the combined mesh model** — one model that fuses every provider: all your API keys, local servers (Ollama, LM Studio, llama.cpp, anything added by link) and keyless community endpoints. Each request is answered by the best available provider, load spreads across all of them, and rate limits fail over silently. It is the default model and the brain behind every other Aetheris model, RAVANA Core and the agent hierarchy.

\`aetheris-free\` · \`aetheris-lite\` · \`aetheris-pro\` · \`aetheris-pro-max\` · \`aetheris-god\` are *policies*, not single models: each maps to a provider allow-list, a token budget and an agent policy (how many specialists Prime may chain, parallel or pipeline, whether Metis critiques). Providers you added by link are always eligible on every tier. All tiers are available to everyone.

## Web grounding
Settings → General → Web search: **auto** searches when the question looks time-sensitive, **on** always, **off** never. Uses Tavily if you add a key; otherwise the keyless fallback.

## Images
Paste or drop up to 4 images; vision-capable providers (Groq, Gemini, GitHub Models, OpenRouter, Mistral, Together, SambaNova, NVIDIA) are preferred automatically.

## Keyboard
⌘/Ctrl+K new chat · ⌘/Ctrl+/ focus composer · ⌘/Ctrl+, settings · Esc stop · Shift+Enter newline.
`},
  { slug: "characters", section: "Getting started", title: "Characters: mythic roleplay & guides", body: `
Open **🏛️ Characters** in the sidebar to browse database-backed AI personas or create one of your own.

## Curated mythic collection
The starter database has 16 source-aware interpretations across **Hindu traditions**, **Greek mythology**, **Norse mythology** and **Egyptian mythology**. Each card includes an interpretation note and conversation starters. Hindu traditions are treated as living and internally diverse, not as one fixed mythology canon.

## Choose a mode
- **🎭 Roleplay** uses a first-person, mythology-inspired voice. It is a creative AI interpretation—not a deity, channeling, supernatural contact or divine authority.
- **📚 Guide** favors education: source context, differences among versions, historical change and explicit uncertainty.

A mode badge remains visible above the conversation and you can switch modes at any time. Character conversations deliberately bypass Prime agent routing so the chosen voice remains stable. Web search, document grounding, memory and Voice remain available.

## Make a private character
Press **Create character**, then set its name, emoji avatar, collection, greeting, traits, detailed instructions, starters and supported modes. Custom characters are private to your browser/account. You can edit or delete them; curated characters are immutable. A deleted character's old transcript is retained but becomes read-only.

Character prompts are looked up by id on the server. A client cannot replace them through the chat request. Shared rules prohibit invented scripture or citations, claims of supernatural certainty, divine commands, worship demands, and using fear or grief to manipulate a user.

Developer API and storage details: [Characters](https://github.com/rajaram-2005/Aetheris/blob/main/docs/CHARACTERS.md).
`},
  { slug: "voice", section: "Getting started", title: "Voice mode: talk to Aetheris", body: `
Press **🎙 Voice** in the composer (or type \`/voice\`) for a hands-free conversation. Tap the orb, speak, and Aetheris answers out loud — then listens again.

## What it does
- **Speech in** — the browser's speech recognition (Chrome, Edge, Safari), language-aware: English (India/US/UK), Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Spanish, French, German, Portuguese, Japanese, Arabic. *Auto* follows your UI language.
- **Speech out** — two engines: **Browser** (instant; starts speaking each sentence as it streams in) or **Studio TTS** (ElevenLabs/Kokoro via the media mesh, higher quality, waits for the whole reply). Pick a voice and speed in ⚙ Options.
- **Interrupt** — tap the orb (or just start talking) while it speaks to cut it off and ask something else.
- **Hands-free loop** — after each reply the mic reopens automatically (switch off in Options).
- **Voice-tuned answers** — the model is told the reply will be read aloud: short, conversational, no markdown/lists/URLs, numbers and units spelled out, in your language. Code or tables, if truly needed, are shown on screen instead of read.
- Works with everything else: \`@tutor quiz me on fractions\`, agents, web search, memory, projects.

## Privacy
Recognition and browser TTS run on your device. No audio is recorded, stored or sent to Aetheris — only the transcribed text is sent, like a typed message.

## Tips
- The 🎙 button in the composer also works as plain dictation without entering voice mode.
- Say "in Tamil" / "தமிழில் சொல்" to switch reply language mid-conversation.
- If the mic won't start, allow microphone access for the site in the browser's address bar.
`},
  { slug: "documents", section: "Getting started", title: "Chat with documents (knowledge bases)", body: `
Open **📁 Docs** in the sidebar (or type \`/docs\`) to build knowledge bases from your own files and get answers grounded in them, with citations.

## Add documents
- Create a knowledge base (e.g. *Company policies*, *Semester 3 notes*, *Client contracts*), then drop in files: **PDF** (page-aware), **DOCX**, **CSV/TSV** (row-aware, so "what is X's price" finds the right row), **TXT/Markdown**, **HTML**, **JSON** and source code. Up to 25 MB each, 40 per knowledge base.
- Add a **web page by URL** or **paste text** (meeting notes, an email thread).
- Re-uploading a file with the same name replaces it.

## Chat with it
Press **💬 Chat with it** (or the 📁 chip in the composer). Every message then retrieves the most relevant passages and the model answers **from your documents**, citing each fact as **[D1]**, **[D2]**… Under each answer you'll see the cited document, page and section; hover to preview the passage. If the documents don't contain the answer, Aetheris says so rather than inventing a citation.

The knowledge base stays attached across chats until you detach it (✕ next to the chip). Works together with agents (\`@lawyer\` review this contract clause), Voice mode and Study mode.

## Test retrieval
Inside a knowledge base, the **Test retrieval** box shows exactly which passages a question would pull up and their scores — useful for checking coverage before you rely on an answer.

## How it works (and why it's free)
Documents are split into ~900-character passages that respect sentences and headings (with overlap), and ranked with **BM25** lexical retrieval — no embedding API, so it works on any host, offline from any provider, deterministically. The top passages (about 12k characters) are placed in the system prompt with numbered labels. Files are stored on the server for your account only (\`data/kb.json\` in your local data directory).

## API
\`GET/POST /api/kb\` · \`GET/PATCH/DELETE /api/kb/:id\` · \`POST /api/kb/:id/docs\` (multipart \`files[]\`, or JSON \`{text,name}\` / \`{url}\`) · \`GET /api/kb/:id/search?q=\` · chat: add \`kb: "<id>"\` to \`POST /api/chat\` and read the \`citations\` event/field.
`},
  { slug: "agents", section: "Agents", title: "The agent hierarchy", body: `
Aetheris agents are built on two base layers:

- **Hermes** — the execution base every agent inherits: think first, be exact, use tools deliberately, show work when it matters, never pad.
- **Metis** — the meta-learning layer: after each run it extracts short, transferable lessons that are stored per user and fed into future plans.

## Tiers
| Tier | Agents | Role |
| --- | --- | --- |
| Ultra | **Prime** ✴️ | Reads the task, picks specialists, decides single / pipeline / parallel, synthesises. |
| God | **Hermes** ⚡, **Metis** 🦉 | Direct high-quality answers; critique & lessons. |
| Sub | 96 specialists | Domain experts with their own protocol, skills and aliases. |

## Auto vs forced
- **Auto**: just ask. Prime plans (you see the plan card), specialists run (live per-agent stream), Prime merges.
- **Forced**: \`@coder fix this\` runs only the Engineer. \`@coder @security review this\` forces a two-agent pipeline. Any alias works (\`@sql\`, \`@postgres\`, \`@query\`).
- The **@ picker** (type \`@\`) searches by id, alias, name, domain or skill.

## Where to look
Agents mode lists everyone by domain with skills and aliases, plus the lessons Metis has learned for you (editable). See **Reference → Agents** for the full roster.
`},
  { slug: "study", section: "Agents", title: "Study mode: quizzes & spaced repetition", body: `
**🎓 Study** turns any subject into a living deck of cards written by the right tutor agent and scheduled by spaced repetition.

## How it works
1. **Create a deck** — subject (e.g. *Class 12 Physics: Electrostatics*, *GST for CA Inter*, *Spanish A2 verbs*, *OWASP Top 10*), optional scope (paste a syllabus or notes), language (English, Tamil, Hindi, bilingual…). The tutor is auto-picked by subject (\`@physics\`, \`@accountant\`, \`@polyglot\`, \`@security\`…) or choose one.
2. **Generate cards** — flashcards, multiple-choice, fill-the-blank (cloze) and short-answer, each atomic and exam-relevant, with an explanation and difficulty. Buttons: **+12 cards**, **+10 MCQ (exam style)**, **+ focused…** (a chapter or weakness), and **+10 adaptive** — which looks at the cards you keep failing and writes new ones that approach the same ideas differently.
3. **Study sessions** — the queue puts overdue cards first, then up to 10 new ones. Flashcards: reveal (\`space\`) then grade **Again / Hard / Good / Easy** (\`1–4\`), with the next interval shown. MCQ/cloze/short-answer: answer and get graded — exact matches instantly, paraphrases by the tutor. **Explain in chat** hands a missed card to the tutor.
4. **Progress** — per-deck stage bar (new → learning → young → mature), due count, retention %, a 56-day heatmap and streak.

## The scheduling (SM-2)
Same family of algorithm as Anki: *Again* resets a card and brings it back in 10 minutes; *Good* moves 1 → 6 → ~15 days and onward by an ease factor; *Hard* shortens and lowers ease; *Easy* lengthens and raises it. Ease never drops below 1.3; intervals cap at a year. Pure functions in \`src/lib/study/srs.ts\` with tests.

## API
\`GET/POST /api/study/decks\` · \`GET/PATCH/DELETE /api/study/decks/:id\` · \`POST …/:id/generate {count, kinds, focus, adaptive}\` · \`POST …/:id/review {cardId, grade}\` · \`POST …/:id/quiz {cardId, answer}\`. Decks are private to the account/device cookie.

## Ethical note
Study mode is built for *learning*, not shortcuts: it quizzes rather than answers, explains after you try, and tracks retention honestly. Use **Explain in chat** and the Socratic recipes in the gallery when you're stuck.
`},
  { slug: "ethics", section: "Agents", title: "AI ethics, explainability & transparency", body: `
Aetheris is built so you can always ask **"why?"** and **"should we?"** of the AI.

## /explain — audit any answer
Click **explain** under any assistant message (or type \`/explain\`). The **AI Explainer** (\`@xai\`) reviews the answer from the outside and returns, in a fixed format:

| Section | What you get |
| --- | --- |
| Fact / inference / guess | Each main claim classified in a table |
| Assumptions made | What the answer silently took for granted |
| Confidence | A percentage with the reason |
| Most likely to be wrong | Where and why it could fail (cutoff, ambiguity, pattern-matching) |
| How to verify | The cheapest check you can do yourself |
| Bias & framing check | Whether the question or answer tilted the result |

It is honest about being an outside review: it did not produce the answer and has no privileged view of the model's internals. Endpoint: \`POST /api/explain { question, answer }\` (SSE).

## /ethics — impact assessment
\`/ethics <plan, feature, dataset or text>\` runs the **AI Ethicist** (\`@ai-ethics\`): purpose & affected people, benefits, harms by type with likelihood × severity, consent/transparency/contestability, accountability, ranked mitigations and a go / go-with-conditions / no-go call. Frameworks (EU AI Act tiers, OECD, India's DPDP Act, NITI Aayog Responsible AI) are cited only when relevant.

## @fairness — bias audit
The **Fairness Auditor** checks text, prompts, datasets and model behaviour across gender, caste, religion, region, language, disability, age and class (India-aware), with a findings table, the mechanism, who is disadvantaged, and measurable fixes.

## Transparency built into every answer
- **Provider line** under each message: which provider/model answered, latency and failovers — nothing is hidden behind a single brand.
- **Agent plan card**: when Prime delegates, you see which specialists ran, their briefs, and their status.
- **Tool trail**: every MCP tool call and web search is shown inline.
- **Sources** on research answers; **Metis verdict scorecard** in debates.
- **Metis lessons** are visible and editable in Agents mode — you can see and delete what the system has learned about you.
- **Your data**: ordinary web usage is browser-local; export any chat as Markdown; OAuth is used only by integrations that need a provider identity; the code is MIT-licensed so anyone can inspect how routing and memory work.

## Learn the concepts
**📚 Learn** in the sidebar (or [/docs/concepts](/docs/concepts)) is a plain-language knowledge base of AI concepts and ethics topics — hallucination, calibration, RAG, bias & fairness metrics, privacy/DPDP, EU AI Act, accountability, human oversight — each with an analogy, a misconception corrected, and a prompt to try. The Explainer and Ethicist link to these pages when they use a concept.

## Limits we state plainly
Answers can be wrong, outdated or biased; the model has no live view of the world unless web search or a tool is used; confidence estimates are themselves estimates. Use \`/explain\` for anything that matters, and verify before acting on medical, legal or financial advice.
`},
  { slug: "workflows", section: "Agents", title: "Workflows", body: `
Workflows chain agents into saved automations. Open **⛓️ Workflows** or type \`/workflows\`.

## Steps
| Kind | What it does |
| --- | --- |
| \`agent\` | Runs one agent with a templated prompt. |
| \`transform\` | Pure text op: \`bullets\`, \`first_line\`, \`extract_json\`, \`strip_code\`, \`upper\`, \`trim:N\`. |
| \`branch\` | Tests a regex against the input; the *else* step is skipped when it matches (and vice-versa). |

## Templates
\`{{input}}\` — the workflow input · \`{{prev}}\` — previous step's output · \`{{steps.<id>}}\` — any earlier step.

## Example
\`\`\`json
[
  { "id": "research", "kind": "agent", "agent": "researcher", "title": "Research", "prompt": "8 key facts about: {{input}}" },
  { "id": "draft",    "kind": "agent", "agent": "writer",     "title": "Draft",    "prompt": "Write 600 words from:\\n{{steps.research}}" },
  { "id": "edit",     "kind": "agent", "agent": "editor",     "title": "Edit",     "prompt": "Tighten this:\\n{{prev}}" }
]
\`\`\`
Runs stream every step; each output is expandable, and **Continue in chat →** carries the final result into a conversation. Public workflows are visible to everyone; duplicate a template to make your own.

## API
\`GET/POST /api/workflows\`, \`GET/DELETE /api/workflows/:id\`, \`POST /api/workflows/:id/run\` (SSE).
`},
  { slug: "schedules", section: "Build", title: "Scheduled automations", body: `
**⏰ Schedules** (sidebar, or \`/schedules\`) run an agent prompt or a whole workflow on a timer and deliver the result — daily briefings, weekly study plans, monthly finance checklists, Monday engineering reminders.

## Create one
1. **Name** and **when** — pick a preset (daily 8:00, weekdays 9:00, every Monday, hourly, 1st of month…) or write a 5-field cron (\`min hour day month weekday\`, lists/ranges/steps/names supported). Time zone defaults to yours (e.g. \`Asia/Kolkata\`). Minimum interval: 15 minutes.
2. **Task** — an **agent prompt** (choose any of the 100+ agents; use \`{{date}}\` for today's date) or a **workflow** from ⛓️ Workflows with its input.
3. **Deliver** — every run is saved in history and published as a **share link** (\`/s/<id>\`). Optionally **email** (server needs \`RESEND_API_KEY\`) and/or a **webhook** (HTTPS POST with JSON \`{schedule, run, text, content}\` — works directly with Slack and Discord incoming webhooks, WhatsApp gateways such as CallMeBot/Twilio via a relay, Zapier, Make, n8n).
4. **▶ Run now** to test immediately; toggle to pause; edit anytime.

## Run history
Each run records status, duration, output, delivery results and the share link. Open a run to read it, copy it, or **Discuss in chat** to refine the prompt. The last 50 runs per schedule are kept.

## How it runs locally
- While the Aetheris server process is alive it ticks every minute and runs anything due.
- Keep the local app running and your computer awake for schedules to execute. The built-in ticker is enough; an optional local cron job can call **\`GET /api/schedules/tick\`** with \`Authorization: Bearer <CRON_SECRET>\`. An external service cannot wake a stopped local app, and no public endpoint is needed.
- A due schedule is *claimed* before it runs, so parallel tickers never double-run it; missed slots are caught up once, not replayed.
- Automations run unattended with a system instruction to produce the complete deliverable without questions.

## API
\`GET/POST /api/schedules\` · \`GET/PATCH/DELETE /api/schedules/:id\` · \`POST /api/schedules/:id/run\` · \`GET /api/schedules/runs?id=\` · \`GET|POST /api/schedules/tick\`.
`},
  { slug: "debate-arena-research", section: "Agents", title: "Debate, Arena and Deep Research", body: `
## /debate <motion>
Two agents argue for and against over up to 4 rounds; **Metis** adjudicates with a scorecard (evidence, logic, rebuttal, clarity), names a winner and gives a balanced bottom line. Great for decisions and essays. \`POST /api/debate { motion, pro?, con?, rounds? }\`.

## ⚔️ Arena
Send one prompt to several providers side by side, vote for the best, and continue the chat from the winner. Votes feed the health ranking.

## 🔬 Deep Research
Plans research angles, searches the web for each, takes notes, writes a cited report with a sources list. Needs a Tavily key (free) in Settings.
`},
  { slug: "factory", section: "Build", title: "GitHub Coding Factory", body: `
Connect GitHub (OAuth or a fine-grained PAT) and describe a program. The factory:
1. Plans the repository structure.
2. Writes files with the Engineer agent (artifacts you can inspect).
3. Creates the repo, commits, and pushes.
4. Runs tests via GitHub Actions and reports results; on failure it iterates.

**Custom target repo** and long specs (> 2000 chars) are available to everyone.

Tips: be concrete about stack, entry points and how to test. The factory prefers small, working programs over large scaffolds.
`},
  { slug: "studio", section: "Build", title: "Studio: images, speech, video", body: `
- **Images** — free image providers with automatic fallback; describe style, subject, composition. Results appear as artifacts you can download.
- **Speech** — text-to-speech in several voices; pick a voice, paste text, download MP3.
- **Video** — short clips via free/BYOK providers; slower and rate-limited, so keep prompts short.
Use \`/image\` from the chat composer to jump to Studio.
`},
  { slug: "apps", section: "Build", title: "Apps: MCP connectors and the Hub", body: `
**Apps** lists 100+ optional MCP connectors (Notion, GitHub, Linear, Slack, Stripe, Google Drive…). Aetheris runs locally; these integrations connect to external services when enabled. Cloud deployment connectors are not included. Enable an app and the chat can call its tools when useful; you see each tool call inline.

- **OAuth connectors** open the provider's consent screen in a new tab.
- **Key connectors** ask for a token which is stored sealed.
- **Gateway** connectors are served by Aetheris itself (weather, currency, wiki, etc.).

## The Aetheris Hub
One MCP endpoint that exposes *all* your enabled connectors to any MCP client (Claude Desktop, Cursor, Windsurf…):
\`\`\`json
{ "mcpServers": { "aetheris": { "url": "http://localhost:3000/api/mcp/hub", "headers": { "Authorization": "Bearer sk-aeth-…" } } } }
\`\`\`
Tools are namespaced \`<connector>__<tool>\`; \`hub__search_tools\` finds tools by description. Create an API key in Settings → API keys.
`},
  { slug: "rooms-share-sync", section: "Collaborate", title: "Local rooms, snapshots and data", body: `
## Local rooms
Click 👥 (or \`/room\`) to turn the current chat into a room at \`/room/<id>\`. Messages show their author and the AI answers in the room. Start a message with \`//\` (or use *aside*) to talk to humans only. Transport is Server-Sent Events with a polling fallback.

Rooms belong to the running local instance. A localhost link is usable only on the same computer; it is not an internet invitation. Keep Aetheris local rather than exposing it with a tunnel.

## Snapshots
🔗 (or \`/share\`) creates a revocable, read-only snapshot at \`/s/<id>\` on your local instance. To send a conversation to someone else, export it as Markdown instead of sending a localhost link.

## Data and legacy sync
Ordinary chats, projects and settings stay in the current browser. Legacy account-sync endpoints remain in the code, but there is no hosted Aetheris sync service or automatic cross-device sync in the anonymous workspace. Export browser data and back up the local server data directory before moving to another computer.
`},
  { slug: "accounts", section: "Collaborate", title: "Accounts and sign-in", body: `
Aetheris opens directly to Chat with anonymous browser-local data. There is no login page and no display-name prompt. No email, phone, or provider account is needed for ordinary conversations.

OAuth sessions are used only by integrations that explicitly need a provider identity. Sessions are sealed cookies valid 90 days. \`DELETE /api/auth/session\` signs out.

### Admins
OAuth identities listed in \`AETHERIS_ADMIN_EMAILS\` get \`/admin\` and full access. In the default (free-for-all) local configuration everyone already has every feature, so admin mainly matters for moderation and the optional billing system.
`},
  { slug: "api", section: "Developers", title: "OpenAI-compatible API", body: `
Create a key in **Settings → API keys** (\`sk-aeth-…\`) and point any OpenAI SDK at \`/api/v1\`.

\`\`\`bash
curl http://localhost:3000/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-aeth-..." -H "Content-Type: application/json" \\
  -d '{ "model": "aetheris-god", "stream": true, "messages": [{ "role": "user", "content": "Hello" }] }'
\`\`\`

\`\`\`python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:3000/api/v1", api_key="sk-aeth-...")
r = client.chat.completions.create(model="aetheris-pro", messages=[{"role": "user", "content": "Explain MCP"}])
\`\`\`

### Extra body options
| Field | Effect |
| --- | --- |
| \`agents: ["coder","security"]\` | Force specialists (multi-agent pipeline). |
| \`hub: true\` | Give the model access to all your enabled MCP connectors as tools. |
| \`connectors: ["notion"]\` | Restrict tools to specific connectors. |
| \`web: "on" | "off" | "auto"\` | Web grounding. |

\`GET /api/v1/models\` lists the tiers. Streaming uses standard \`data:\` chunks with \`[DONE]\`.
`},
  { slug: "control-center", section: "Developers", title: "Control Center, Capability Registry & permissions", body: `
Aetheris is organised as an **Intelligence OS**: every model, agent, tool, connector and subsystem is a *capability* with an honest status, a permission level and live telemetry. **🎛️ Control Center** (sidebar, or \`/control\`) is where you see all of it.

## Tabs
- **Overview** — providers ready / cooling down, capability counts by status, events and errors in the last hour, model mesh, your permission grants, and the **platform status board**: each subsystem marked IMPLEMENTED · PARTIAL · EXPERIMENTAL · MOCKED · NOT AVAILABLE. Nothing is mocked; Physical AI, robotics, digital twins, browser agent and server sandbox are shown as *not available* because they are designed but not built.
- **Registry** — search 370+ capabilities (\`pdf\`, \`tamil\`, \`github\`, \`mqtt\`, \`vision\`…) with category, status, required permission and measured reliability.
- **Events** — live feed of model attempts, agent steps, tool/MCP calls, schedule runs and permission decisions (your own + system events; admins see everyone's).
- **Intent** — type a command and see how Aetheris would route it (task, mode, agents, connectors) *before* sending — locally, no model call. Override with \`@agent\` or \`/mode\`.
- **Permissions** — test the execution policy on any capability with and without confirmation.

## Permission model
Levels: \`read_only\` < \`safe_write\` < \`full_workspace\` < \`admin\`, plus \`physical\` which is never implied and never granted by default. Everyone gets \`read_only + safe_write\` over their own data. Anything higher, or flagged *requires confirmation* (e.g. Coding Factory pushes, delete tools), needs a **single-use confirmation token** bound to you and that capability, valid 5 minutes. Every decision is audited. Admins: \`AETHERIS_ADMIN_UIDS=uid1,uid2\`.

## APIs
\`GET /api/capabilities?q=&category=&status=&tags=&maxSecurity=&id=\` · \`POST /api/intent {text}\` · \`GET /api/telemetry?type=&limit=&errors=1\` · \`GET/POST /api/permissions\`.

## For contributors
Add a capability by registering a source (\`registerSource\` in \`src/core/capabilities\`) — never by editing Core. Ask the policy (\`authorize\`) before acting; call \`record\`/\`traced\` so it shows up here. Full audit, architecture map and 20-phase roadmap: \`docs/ARCHITECTURE.md\`.
`},
  { slug: "local-setup", section: "Developers", title: "Local setup and configuration", body: `
Aetheris is a local-only application. Use Node.js 22.x for a source checkout:

\`\`\`bash
git clone https://github.com/rajaram-2005/Aetheris.git
cd Aetheris
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
\`\`\`

Open **http://localhost:3000**. For an optimized local build, run \`npm run build\`, then \`npm start -- --hostname 127.0.0.1\`. The hostname override keeps the browser workflow on loopback. No public host, domain or deployment account is needed.

Keyless online providers work without model keys, subject to availability and rate limits. Browser data stays in that browser; server records live in \`data/\` (\`AETHERIS_DATA_DIR\`) as JSON and SQLite. Back up both. Use one local process per data directory, and keep it running for schedules.

### Important variables
| Variable | Purpose |
| --- | --- |
| \`AETHERIS_SECRET\` | Seals cookies, stored keys and credentials. Generate locally and keep stable. |
| \`AETHERIS_REQUIRE_AUTH=0\`, \`AETHERIS_GUEST_ACCESS=0\` | Legacy compatibility settings; no login or display name is required. |
| \`AETHERIS_ADMIN_EMAILS\` | Optional OAuth admin identities. |
| \`GOOGLE_CLIENT_ID/SECRET\`, \`GITHUB_CLIENT_ID/SECRET\` | Optional integration credentials with exact localhost callbacks. |
| \`<PROVIDER>_API_KEY\` | Optional online model keys. |
| \`AETHERIS_LOCALITY=local\` | Restrict model inference to configured local providers (Ollama, LM Studio or a local OpenAI-compatible server). |
| \`AETHERIS_PAID_PLANS=0\` | Keep legacy billing disabled for local use. |

Local hosting does not mean offline: online providers, web search, GitHub and connected MCP services make outbound requests. The model-locality setting does not disable those integrations.

Optional Docker: \`docker compose up -d --build\` publishes only \`127.0.0.1:3000\` and saves server data in the \`aetheris-data\` volume. Do not expose the anonymous workspace through a public host or tunnel.

Full setup, backups and local model configuration: [docs/LOCAL_SETUP.md](https://github.com/rajaram-2005/Aetheris/blob/main/docs/LOCAL_SETUP.md).
`},
  { slug: "desktop", section: "Developers", title: "Desktop app (macOS, Linux, Windows)", body: `
Aetheris also runs as a native desktop app — the same code, wrapped in Electron. Download the installer for your platform from the [releases page](https://github.com/rajaram-2005/Aetheris/releases):

| Platform | Artefacts |
| --- | --- |
| macOS | \`.dmg\` + \`.zip\` — Apple silicon and Intel. Unsigned: right-click → **Open** the first time. |
| Linux | \`.AppImage\`, \`.deb\`, \`.rpm\` — x64 and arm64 |
| Windows | NSIS installer + \`.zip\` — x64 |

## Local use
- **Embedded** (default) — the app starts its own Aetheris server on \`127.0.0.1\` and your data lives in \`~/Library/Application Support/Aetheris\` (macOS), \`~/.config/Aetheris\` (Linux) or \`%APPDATA%/Aetheris\` (Windows).
- **Local development** — \`npm run desktop:dev\` connects the shell to a Next.js development process on the same computer for hot reload. The connection mode is internally called \`remote\`, but a public or remote Aetheris host is not a supported workflow.

Use **Use the embedded server** in Connection settings for normal local operation. Provider keys go in \`<data dir>/.env.local\` as \`KEY=value\` — a shell export does not reach an app launched from Finder or the Start menu. Online models, integrations and update checks still use the internet; local inference requires a configured local model server.

## Versions
Aetheris releases **every month** on CalVer \`YYYY.M.P\` (\`2026.9.1\` → \`2026.10.1\` → \`2027.1.1\`). The app checks for a new release at startup and once an hour, and links the download — it never installs anything by itself.

## Building it yourself
\`\`\`bash
npm run desktop:dev      # next dev + the desktop shell, with hot reload
npm run desktop:build    # standalone server → resources/server → an unpacked app you can run
cd desktop && npm run dist:mac    # .dmg (macOS) · dist:linux · dist:win
\`\`\`
Full details, the security model and troubleshooting: [docs/DESKTOP.md](https://github.com/rajaram-2005/Aetheris/blob/main/docs/DESKTOP.md).
`},
  { slug: "contributing", section: "Developers", title: "Contributing", body: `
Aetheris is MIT-licensed. See \`CONTRIBUTING.md\` for the code map.

- **Add a provider**: \`src/lib/router/providers.ts\` (+ adapter in \`adapters.ts\` if not OpenAI-compatible).
- **Add an agent**: \`src/lib/agents/catalog-extended.ts\` — id, aliases, description, ≥3 skills, a real protocol in \`system\`.
- **Add an MCP connector**: \`src/lib/mcp/catalog.ts\`; verify with \`npx tsx scripts/verify-connectors.ts\`.
- **Add gallery prompts**: \`src/lib/gallery/seeds/*.ts\`.
- **Add a language**: \`src/lib/i18n.ts\`.
- Run \`npm run typecheck && npm test\` before a PR.
`},
];
