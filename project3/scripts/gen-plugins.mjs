// One-shot generator: emits apps/web/lib/catalog-plugins.ts (110+ plugin
// entries for the marketplace). Run: node scripts/gen-plugins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// [name, description, scopes[], tags[], author]
const PLUGINS = [
  ['Linear Bridge', 'Sync tasks between Lumen projects and a Linear team via API.', ['network', 'memory.write'], ['tasks', 'sync'], 'lumen-community'],
  ['Notion Sync', 'Two-way sync of project docs into Notion pages (selected folders only).', ['network', 'fs.read'], ['docs', 'sync'], 'lumen-community'],
  ['Slack Post', 'Post agent digests, incident notes and approvals to Slack channels.', ['network'], ['chat', 'ops'], 'lumen-community'],
  ['Discord Bridge', 'Relay workspace activity and chat replies to a Discord server via webhooks.', ['network'], ['chat', 'community'], 'lumen-community'],
  ['Telegram Bot', 'Chat with the workspace and receive scheduled reports over Telegram.', ['network'], ['chat', 'automation'], 'lumen-community'],
  ['WhatsApp Gateway', 'Send approval requests and digest summaries to WhatsApp via Twilio.', ['network'], ['chat', 'ops'], 'lumen-community'],
  ['Email Digest', 'Compose and send daily/weekly digests through any SMTP provider.', ['network'], ['email', 'reporting'], 'lumen-community'],
  ['GitHub Issues', 'Create and sync issues from task statuses, with labels and milestones.', ['git', 'network'], ['github', 'tasks'], 'lumen-community'],
  ['GitLab Sync', 'Mirror milestones and issues into a self-hosted GitLab instance.', ['git', 'network'], ['gitlab', 'tasks'], 'lumen-community'],
  ['Jira Connector', 'Push epics and stories into Jira with sprint mapping.', ['network'], ['jira', 'tasks'], 'lumen-community'],
  ['Trello Cards', 'Mirror task lists as Trello cards with due dates.', ['network'], ['tasks', 'boards'], 'lumen-community'],
  ['Asana Tasks', 'Two-way task sync with Asana projects.', ['network'], ['tasks'], 'lumen-community'],
  ['Monday.com Sync', 'Sync boards and task states with Monday.com.', ['network'], ['tasks', 'boards'], 'lumen-community'],
  ['ClickUp Bridge', 'Push tasks and comments into ClickUp lists.', ['network'], ['tasks'], 'lumen-community'],
  ['Google Calendar', 'Create calendar events from scheduled agent tasks.', ['network'], ['calendar', 'schedule'], 'lumen-community'],
  ['Outlook Calendar', 'Sync schedule entries with Microsoft 365 calendars.', ['network'], ['calendar', 'schedule'], 'lumen-community'],
  ['Cron Helper', 'Human-friendly cron builder with preview and next-run computation.', [], ['schedule', 'cron'], 'aetherion'],
  ['Timezone Guard', 'Convert schedule times across team timezones with DST awareness.', [], ['schedule', 'time'], 'aetherion'],
  ['Sentry MCP', 'Issues, releases and stack traces through the official Sentry MCP.', ['network'], ['monitoring', 'mcp'], 'Sentry'],
  ['Datadog Stream', 'Stream metric anomalies into the workspace activity feed.', ['network'], ['monitoring', 'ops'], 'lumen-community'],
  ['Prometheus Scrape', 'Scrape local Prometheus endpoints and alert on thresholds.', ['network'], ['monitoring', 'metrics'], 'lumen-community'],
  ['Grafana Snapshots', 'Embed Grafana panel snapshots into incident notes.', ['network'], ['monitoring', 'dashboards'], 'lumen-community'],
  ['PagerDuty Handoff', 'Create and resolve PagerDuty incidents from workspace alerts.', ['network'], ['ops', 'incidents'], 'lumen-community'],
  ['Opsgenie Alerts', 'Route workspace alerts into Opsgenie with priority mapping.', ['network'], ['ops', 'incidents'], 'lumen-community'],
  ['Status Page', 'Publish a public status page from incident states.', ['network'], ['ops', 'status'], 'lumen-community'],
  ['Healthchecks.io', 'Ping Healthchecks.io from scheduled runs for dead-man monitoring.', ['network'], ['monitoring', 'schedule'], 'lumen-community'],
  ['Uptime Kuma', 'Register workspace endpoints with a self-hosted Uptime Kuma.', ['network'], ['monitoring'], 'lumen-community'],
  ['AWS Cost Guard', 'Pull AWS cost anomalies into weekly digests.', ['network'], ['cloud', 'cost'], 'lumen-community'],
  ['Terraform Lint', 'Validate and lint Terraform plans before agent changes.', ['terminal', 'fs.read'], ['iac', 'devops'], 'lumen-community'],
  ['Kubernetes Lens', 'Summarize cluster state and pod health into plain language.', ['network', 'terminal'], ['k8s', 'ops'], 'lumen-community'],
  ['Docker Registry Clean', 'Find and prune stale images with a dry-run report.', ['terminal'], ['docker', 'ops'], 'lumen-community'],
  ['Vault Secrets', 'Pull approved secrets from HashiCorp Vault with scope audit.', ['network'], ['security', 'secrets'], 'aetherion'],
  ['1Password Bridge', 'Resolve references to shared vaults via the 1Password CLI.', ['network'], ['security', 'secrets'], 'lumen-community'],
  ['Secret Scanner', 'Scan repositories for leaked keys with gitleaks rules.', ['fs.read', 'git'], ['security', 'scanning'], 'lumen-community'],
  ['Policy Guard', 'Evaluate agent actions against OPA/Rego policies before approval.', ['terminal'], ['security', 'policy'], 'lumen-community'],
  ['SBOM Generator', 'Produce software bills of materials for project trees.', ['fs.read'], ['security', 'supply-chain'], 'lumen-community'],
  ['License Checker', 'Audit dependency licenses and flag conflicts.', ['fs.read'], ['security', 'licenses'], 'lumen-community'],
  ['Phish Triage', 'Analyze forwarded emails for phishing signals.', ['network'], ['security', 'email'], 'lumen-community'],
  ['Snyk Scan', 'Stream Snyk vulnerability results into project security views.', ['network'], ['security', 'vulns'], 'lumen-community'],
  ['Trivy Images', 'Scan container images with Trivy and file findings.', ['terminal'], ['security', 'containers'], 'lumen-community'],
  ['PDF Extract', 'Pull text and tables out of PDFs into the knowledge base.', ['fs.read'], ['documents', 'kb'], 'aetherion'],
  ['DOCX Import', 'Convert Word documents into ingestible markdown.', ['fs.read'], ['documents', 'kb'], 'aetherion'],
  ['XLSX Tables', 'Import spreadsheet sheets as structured knowledge tables.', ['fs.read'], ['documents', 'data'], 'aetherion'],
  ['Markdown Lint', 'Lint workspace docs with configurable markdown rules.', ['fs.read'], ['docs', 'lint'], 'lumen-community'],
  ['Link Rot Checker', 'Find broken links across knowledge docs and fix suggestions.', ['network', 'fs.read'], ['docs', 'kb'], 'lumen-community'],
  ['Citation Formatter', 'Format knowledge citations in APA/MLA/Chicago.', [], ['docs', 'citations'], 'aetherion'],
  ['Doc Translator', 'Translate knowledge docs across 30 languages with glossary support.', ['network'], ['docs', 'i18n'], 'lumen-community'],
  ['Changelog Writer', 'Generate changelogs from git history with category grouping.', ['git'], ['git', 'docs'], 'lumen-community'],
  ['README Generator', 'Draft README files from project structure and usage analysis.', ['fs.read'], ['docs', 'git'], 'aetherion'],
  ['API Doc Scraper', 'Scrape OpenAPI specs into reference knowledge.', ['network', 'fs.read'], ['docs', 'api'], 'lumen-community'],
  ['Diagrams as Code', 'Render Mermaid diagrams from natural-language descriptions.', [], ['diagrams', 'docs'], 'aetherion'],
  ['Flowchart Studio', 'Build and export flowchart JSON for workflow nodes.', [], ['diagrams', 'workflows'], 'aetherion'],
  ['PlantUML Render', 'Compile PlantUML sources into SVG artifacts.', ['terminal'], ['diagrams'], 'lumen-community'],
  ['Figma Frame Import', 'Import Figma frames as design references.', ['network'], ['design'], 'lumen-community'],
  ['Palette Extractor', 'Extract palettes from images for art generation seeds.', ['fs.read'], ['design', 'art'], 'aetherion'],
  ['Image Optimizer', 'Compress and resize generated images with quality presets.', ['fs.read', 'fs.write'], ['media', 'images'], 'aetherion'],
  ['Video Trimmer', 'Trim and clip generated videos with ffmpeg presets.', ['terminal'], ['media', 'video'], 'lumen-community'],
  ['Audio Transcriber', 'Transcribe audio clips into memory entries.', ['network'], ['media', 'audio'], 'lumen-community'],
  ['OCR Passport', 'Extract text from scanned documents and images.', ['network'], ['media', 'ocr'], 'lumen-community'],
  ['Thumbnail Maker', 'Generate thumbnail variants for media exports.', ['fs.write'], ['media', 'images'], 'aetherion'],
  ['Watermark Studio', 'Stamp workspace-generated art with configurable marks.', ['fs.write'], ['media', 'images'], 'aetherion'],
  ['Browser Driver', 'Drive a headless browser: navigate, click, screenshot.', ['browser'], ['browser', 'automation'], 'aetherion'],
  ['Scraper Guard', 'Polite scraping with rate limits, robots.txt and caching.', ['browser', 'network'], ['browser', 'data'], 'lumen-community'],
  ['Form Filler', 'Fill web forms from structured task data.', ['browser'], ['browser', 'automation'], 'lumen-community'],
  ['Price Watcher', 'Track product pages and alert on price drops.', ['browser', 'network'], ['browser', 'shopping'], 'lumen-community'],
  ['News Radar', 'Collect curated news into daily knowledge briefs.', ['network'], ['news', 'research'], 'lumen-community'],
  ['ArXiv Digest', 'Pull new arXiv papers matching research topics.', ['network'], ['research', 'papers'], 'lumen-community'],
  ['PubMed Scan', 'Search biomedical literature for evidence summaries.', ['network'], ['research', 'health'], 'lumen-community'],
  ['Web Search Agent', 'Searches the web, dedupes results and files sourced notes.', ['network'], ['search', 'research'], 'aetherion'],
  ['Sitemap Crawler', 'Crawl a sitemap into a structured knowledge tree.', ['network'], ['crawl', 'kb'], 'lumen-community'],
  ['RSS Ingest', 'Subscribe to RSS feeds and ingest new items into memory.', ['network'], ['rss', 'kb'], 'lumen-community'],
  ['Podcast Notes', 'Transcribe podcast URLs into searchable notes.', ['network'], ['media', 'notes'], 'lumen-community'],
  ['YouTube Summary', 'Summarize YouTube transcripts into bullet digests.', ['network'], ['media', 'summaries'], 'lumen-community'],
  ['Weather Monitor', 'Attach live weather context to scheduled outdoor tasks.', ['network'], ['weather', 'schedule'], 'lumen-community'],
  ['Currency FX', 'Convert currencies at live rates inside agent calculations.', ['network'], ['finance', 'data'], 'lumen-community'],
  ['Stock Ticker', 'Pull quote snapshots for portfolio memory entries.', ['network'], ['finance', 'data'], 'lumen-community'],
  ['Crypto Tracker', 'Track wallet balances and price alerts.', ['network'], ['finance', 'crypto'], 'lumen-community'],
  ['Invoice Generator', 'Create PDF invoices from completed task records.', ['fs.write'], ['finance', 'docs'], 'aetherion'],
  ['Expense Ledger', 'Log workspace costs into a local expense ledger.', ['memory.write'], ['finance', 'ledger'], 'aetherion'],
  ['Habit Tracker', 'Track recurring personal goals with streak charts.', ['memory.write'], ['health', 'habits'], 'lumen-community'],
  ['Fitness Coach', 'Plan workout schedules from activity memory.', ['memory.write'], ['health', 'fitness'], 'lumen-community'],
  ['Meal Planner', 'Generate weekly meal plans from preferences and pantry notes.', [], ['health', 'planning'], 'lumen-community'],
  ['Meditation Timer', 'Run timed mindfulness sessions with ambient sound hooks.', [], ['health', 'audio'], 'aetherion'],
  ['Sleep Journal', 'Log sleep data and correlate with activity.', ['memory.write'], ['health', 'journal'], 'lumen-community'],
  ['Study Deck Maker', 'Turn knowledge docs into spaced-repetition decks.', ['fs.write'], ['learning', 'study'], 'aetherion'],
  ['Quiz Generator', 'Build quizzes from memory entries with scoring.', [], ['learning', 'quiz'], 'aetherion'],
  ['Flashcard Sync', 'Sync study decks with Anki via AnkiConnect.', ['network'], ['learning', 'anki'], 'lumen-community'],
  ['Tutor Agent', 'Socratic tutoring on knowledge-base topics.', [], ['learning', 'agents'], 'aetherion'],
  ['Lesson Planner', 'Structure study plans with milestones and reviews.', [], ['learning', 'planning'], 'aetherion'],
  ['Prompt Library', 'Curated prompt templates for every model family.', [], ['prompts', 'models'], 'aetherion'],
  ['Model Evaluator', 'Run side-by-side model evaluations with scoring rubrics.', ['models'], ['models', 'evals'], 'aetherion'],
  ['Router Overrides', 'Per-intent routing rules that override the default router.', [], ['models', 'routing'], 'aetherion'],
  ['Cost Dashboard', 'Track per-model spend across providers.', ['memory.write'], ['models', 'cost'], 'lumen-community'],
  ['Context Compactor', 'Summarize long conversations to fit context windows.', ['models'], ['models', 'context'], 'aetherion'],
  ['Token Meter', 'Estimate token usage before each request.', [], ['models', 'tokens'], 'aetherion'],
  ['SQL Explorer', 'Query SQLite/Postgres stores with read-only safeguards.', ['db'], ['data', 'sql'], 'aetherion'],
  ['CSV Studio', 'Profile, clean and pivot CSV files with recipes.', ['fs.read'], ['data', 'csv'], 'aetherion'],
  ['JSON Formatter', 'Validate, format and diff JSON documents.', ['fs.read'], ['data', 'json'], 'aetherion'],
  ['Data Profiler', 'Column stats, nulls and type inference for datasets.', ['fs.read'], ['data', 'analytics'], 'aetherion'],
  ['Embedding Index', 'Rebuild and inspect embedding indexes for knowledge.', ['db'], ['kb', 'embeddings'], 'aetherion'],
  ['Graph Explorer', 'Visualize knowledge graph neighborhoods.', [], ['kb', 'graphs'], 'aetherion'],
  ['Memory Pruner', 'Archive stale memory entries with retention rules.', ['memory.write'], ['memory', 'housekeeping'], 'aetherion'],
  ['Memory Exporter', 'Export memory to markdown/JSON with redaction.', ['memory.write', 'fs.write'], ['memory', 'export'], 'aetherion'],
  ['Dream Journal', 'Log narrative dreams and mine recurring themes.', ['memory.write'], ['memory', 'creative'], 'lumen-community'],
  ['Voice Commands', 'Run workspace actions from spoken commands.', ['network'], ['voice', 'automation'], 'lumen-community'],
  ['Screen Reader Bridge', 'Accessible narration of workspace activity.', [], ['accessibility', 'audio'], 'aetherion'],
  ['Contrast Auditor', 'Check UI exports against WCAG contrast rules.', [], ['accessibility', 'design'], 'aetherion'],
  ['Alt Text Writer', 'Generate alt text for generated images.', [], ['accessibility', 'media'], 'aetherion'],
  ['Workspace Backup', 'Snapshot workspace state to encrypted archives.', ['fs.read', 'fs.write'], ['backup', 'storage'], 'aetherion'],
  ['Cloud Drive Mount', 'Mount Puter cloud storage into the workspace file tree.', ['network', 'fs.read'], ['storage', 'cloud'], 'aetherion'],
  ['S3 Mirror', 'Mirror generated artifacts to S3-compatible buckets.', ['network', 'fs.write'], ['storage', 'cloud'], 'lumen-community'],
  ['iCloud Notes Sync', 'Sync memory entries with Apple Notes via shortcuts.', ['network'], ['storage', 'sync'], 'lumen-community'],
  ['Dropbox Sync', 'Sync exports to a Dropbox app folder.', ['network'], ['storage', 'sync'], 'lumen-community'],
  ['Zapier Trigger', 'Fire Zapier zaps on workspace events.', ['network'], ['automation', 'zapier'], 'lumen-community'],
  ['IFTTT Rules', 'Connect workspace events to IFTTT applets.', ['network'], ['automation', 'ifttt'], 'lumen-community'],
  ['n8n Export', 'Export workflows to n8n-compatible JSON.', [], ['automation', 'n8n'], 'aetherion'],
  ['Make.com Bridge', 'Trigger Make scenarios from workflow completion.', ['network'], ['automation'], 'lumen-community'],
  ['Home Assistant', 'Control smart-home entities from agent actions.', ['network'], ['automation', 'iot'], 'lumen-community'],
  ['MQTT Gateway', 'Publish workspace events to MQTT brokers.', ['network'], ['iot', 'events'], 'lumen-community'],
  ['Weather Station', 'Ingest local weather-station telemetry into memory.', ['network'], ['iot', 'weather'], 'lumen-community'],
  ['Robot Bridge', 'Send validated commands to ROS-connected robots.', ['network'], ['robotics', 'iot'], 'aetherion'],
];

const out = [];
for (const [name, description, scopes, tags, author] of PLUGINS) {
  const id = 'cat-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  out.push(`  { id: '${id}', kind: 'plugin' as const, name: ${JSON.stringify(name)}, description: ${JSON.stringify(description)}, version: '1.0.0', author: ${JSON.stringify(author)}, license: 'MIT', scopes: ${JSON.stringify(scopes)}, tags: ${JSON.stringify(tags)} },`);
}

const header = `/**
 * Lumen — plugin catalog (${PLUGINS.length}+ entries).
 * Every entry is a valid marketplace manifest: install lands it in the local
 * registry with exactly the declared scopes. Generated by
 * scripts/gen-plugins.mjs — edit the generator, not this file.
 */
import type { CatalogItem } from '@sutra/shared';

export const PLUGIN_CATALOG: CatalogItem[] = [
${out.join('\n')}
];
`;

const target = path.join(__dirname, '..', 'apps', 'web', 'lib', 'catalog-plugins.ts');
fs.writeFileSync(target, header);
console.log(`wrote ${target} with ${PLUGINS.length} plugins`);
