// One-shot generator: emits apps/web/lib/puter-models.ts (the Puter gateway
// model catalog, 520+ entries). Run: node scripts/gen-puter-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// [familyId, provider, displayPrefix, entries: [idSuffix, nameSuffix, ctx, costIn, costOut, caps...]]
const F = (id, provider, nameBase, ctx, costIn, costOut, caps, suffixes) =>
  suffixes.map(([suf, label, c = ctx, ci = costIn, co = costOut, extra = []]) => ({
    id: id + (suf ? '-' + suf : ''),
    name: `${nameBase}${label ? ' ' + label : ''}`,
    provider,
    family: id,
    contextWindow: c,
    costIn: ci,
    costOut: co,
    capabilities: [...new Set([...caps, ...extra])],
  }));

const T = ['structured', 'code', 'math']; // text models
const TC = ['structured', 'code', 'math', 'creative'];
const V = ['structured', 'code', 'vision'];
const VISION = ['vision'];

const entries = [];

// ── OpenAI ────────────────────────────────────────────────────────────────────
entries.push(...F('gpt-4o', 'openai', 'GPT-4o', 128000, 2.5, 10, ['code', 'math', 'structured', 'vision'], [['', ''], ['mini', 'Mini', 128000, 0.15, 0.6]]));
entries.push(...F('gpt-4.1', 'openai', 'GPT-4.1', 1000000, 2.0, 8.0, ['code', 'math', 'structured'], [['', ''], ['mini', 'Mini', 1000000, 0.4, 1.6], ['nano', 'Nano', 1000000, 0.1, 0.4]]));
entries.push(...F('gpt-4-turbo', 'openai', 'GPT-4 Turbo', 128000, 10, 30, ['code', 'math', 'structured', 'vision'], [['', ''], ['preview', 'Preview']]));
entries.push(...F('gpt-4', 'openai', 'GPT-4', 8192, 30, 60, T, [['', ''], ['32k', '32K', 32768]]));
entries.push(...F('gpt-3.5-turbo', 'openai', 'GPT-3.5 Turbo', 16385, 0.5, 1.5, T, [['', ''], ['16k', '16K', 16385], ['instruct', 'Instruct', 4096, 1.5, 2]]));
entries.push(...F('o1', 'openai', 'o1', 200000, 15, 60, ['code', 'math', 'structured'], [['', ''], ['mini', 'Mini', 128000, 1.1, 4.4], ['pro', 'Pro', 200000, 150, 600], ['preview', 'Preview']]));
entries.push(...F('o3', 'openai', 'o3', 200000, 10, 40, ['code', 'math', 'structured'], [['', ''], ['mini', 'Mini', 200000, 1.1, 4.4]]));
entries.push(...F('o4-mini', 'openai', 'o4-mini', 200000, 1.1, 4.4, ['code', 'math', 'structured'], [['', '']]));
entries.push(...F('gpt-4.5', 'openai', 'GPT-4.5', 128000, 75, 150, ['code', 'math', 'structured', 'vision'], [['', ''], ['preview', 'Preview']]));
entries.push(...F('gpt-5', 'openai', 'GPT-5', 400000, 1.25, 10, ['code', 'math', 'structured', 'vision'], [['', ''], ['mini', 'Mini', 400000, 0.25, 2], ['nano', 'Nano', 400000, 0.05, 0.4], ['1', '1', 400000, 1.25, 10]]));
entries.push(...F('dall-e', 'openai', 'DALL·E', 0, 0, 0, ['creative'], [['3', '3'], ['2', '2']]));
entries.push(...F('gpt-image', 'openai', 'GPT Image', 0, 0, 0, ['creative'], [['1', '1']]));

// ── Anthropic ────────────────────────────────────────────────────────────────
entries.push(...F('claude-opus-4', 'anthropic', 'Claude Opus 4', 200000, 15, 75, ['code', 'math', 'structured', 'vision'], [['', ''], ['1', '1', 200000, 15, 75]]));
entries.push(...F('claude-sonnet-4', 'anthropic', 'Claude Sonnet 4', 200000, 3, 15, ['code', 'math', 'structured', 'vision'], [['', ''], ['5', '5', 200000, 3, 15]]));
entries.push(...F('claude-haiku-4', 'anthropic', 'Claude Haiku 4', 200000, 0.8, 4, ['structured', 'vision'], [['', ''], ['5', '5', 200000, 0.8, 4]]));
entries.push(...F('claude-3-7-sonnet', 'anthropic', 'Claude 3.7 Sonnet', 200000, 3, 15, ['code', 'math', 'structured', 'vision'], [['', '']]));
entries.push(...F('claude-3-5-sonnet', 'anthropic', 'Claude 3.5 Sonnet', 200000, 3, 15, ['code', 'math', 'structured', 'vision'], [['', ''], ['latest', 'Latest'], ['v2', 'v2']]));
entries.push(...F('claude-3-5-haiku', 'anthropic', 'Claude 3.5 Haiku', 200000, 0.8, 4, ['structured', 'vision'], [['', ''], ['latest', 'Latest']]));
entries.push(...F('claude-3-opus', 'anthropic', 'Claude 3 Opus', 200000, 15, 75, ['code', 'math', 'structured', 'vision'], [['', ''], ['latest', 'Latest']]));
entries.push(...F('claude-3-sonnet', 'anthropic', 'Claude 3 Sonnet', 200000, 3, 15, ['code', 'structured', 'vision'], [['', '']]));
entries.push(...F('claude-3-haiku', 'anthropic', 'Claude 3 Haiku', 200000, 0.25, 1.25, ['structured', 'vision'], [['', '']]));
entries.push(...F('claude-2', 'anthropic', 'Claude 2', 100000, 8, 24, T, [['', ''], ['1', '1', 200000]]));

// ── Google ───────────────────────────────────────────────────────────────────
entries.push(...F('gemini-2.5-pro', 'google', 'Gemini 2.5 Pro', 1000000, 1.25, 10, ['code', 'math', 'structured', 'vision'], [['', ''], ['preview', 'Preview']]));
entries.push(...F('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash', 1000000, 0.3, 2.5, ['code', 'math', 'structured', 'vision'], [['', ''], ['lite', 'Lite', 1000000, 0.1, 0.4], ['preview', 'Preview']]));
entries.push(...F('gemini-2.0-flash', 'google', 'Gemini 2.0 Flash', 1000000, 0.1, 0.4, ['code', 'math', 'structured', 'vision'], [['', ''], ['lite', 'Lite'], ['thinking', 'Thinking']]));
entries.push(...F('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro', 2000000, 1.25, 5, ['code', 'math', 'structured', 'vision'], [['', ''], ['latest', 'Latest']]));
entries.push(...F('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash', 1000000, 0.075, 0.3, ['code', 'math', 'structured', 'vision'], [['', ''], ['8b', '8B', 1000000, 0.0375, 0.15], ['latest', 'Latest']]));
entries.push(...F('gemini-pro', 'google', 'Gemini Pro', 32760, 0.5, 1.5, T, [['', '']]));
entries.push(...F('gemma-3', 'google', 'Gemma 3', 128000, 0, 0, ['code', 'math', 'structured', 'vision'], [['27b', '27B', 128000, 0.1, 0.1], ['12b', '12B', 128000, 0.03, 0.03], ['4b', '4B', 128000, 0.006, 0.006], ['1b', '1B', 32000, 0.001, 0.001]]));
entries.push(...F('gemma-2', 'google', 'Gemma 2', 8192, 0, 0, T, [['27b', '27B', 8192, 0.27, 0.27], ['9b', '9B', 8192, 0.06, 0.06], ['2b', '2B', 8192, 0.01, 0.01]]));
entries.push(...F('gemma', 'google', 'Gemma', 8192, 0, 0, T, [['7b', '7B'], ['2b', '2B']]));
entries.push(...F('codegemma', 'google', 'CodeGemma', 8192, 0, 0, ['code'], [['7b', '7B'], ['2b', '2B']]));
entries.push(...F('imagen', 'google', 'Imagen', 0, 0, 0, ['creative'], [['4', '4'], ['3', '3']]));
entries.push(...F('palm-2', 'google', 'PaLM 2', 8192, 0.5, 1.5, T, [['', ''], ['chat-bison', 'Chat Bison']]));

// ── xAI ──────────────────────────────────────────────────────────────────────
entries.push(...F('grok-4', 'xai', 'Grok 4', 256000, 3, 15, ['code', 'math', 'structured', 'vision'], [['', ''], ['fast', 'Fast', 256000, 0.2, 0.5]]));
entries.push(...F('grok-3', 'xai', 'Grok 3', 131072, 3, 15, ['code', 'math', 'structured', 'vision'], [['', ''], ['mini', 'Mini', 131072, 0.3, 0.5]]));
entries.push(...F('grok-2', 'xai', 'Grok 2', 131072, 2, 10, T, [['', ''], ['vision', 'Vision', 131072, 2, 10, VISION], ['latest', 'Latest']]));
entries.push(...F('grok-beta', 'xai', 'Grok Beta', 131072, 5, 15, T, [['', '']]));
entries.push(...F('grok-vision-beta', 'xai', 'Grok Vision Beta', 8192, 5, 15, V, [['', '']]));

// ── Meta ─────────────────────────────────────────────────────────────────────
entries.push(...F('llama-4', 'meta', 'Llama 4', 1000000, 0.2, 0.5, ['code', 'math', 'structured', 'vision'], [['maverick', 'Maverick', 1000000, 0.2, 0.6], ['scout', 'Scout', 1000000, 0.11, 0.34]]));
entries.push(...F('llama-3.3', 'meta', 'Llama 3.3', 128000, 0.12, 0.3, T, [['70b', '70B']]));
entries.push(...F('llama-3.2', 'meta', 'Llama 3.2', 128000, 0.03, 0.05, T, [['90b', '90B Vision', 128000, 0.4, 0.4, VISION], ['11b', '11B Vision', 128000, 0.03, 0.05, VISION], ['3b', '3B'], ['1b', '1B']]));
entries.push(...F('llama-3.1', 'meta', 'Llama 3.1', 128000, 0.2, 0.5, T, [['405b', '405B', 128000, 0.8, 0.9], ['70b', '70B', 128000, 0.2, 0.5], ['8b', '8B', 128000, 0.03, 0.05]]));
entries.push(...F('llama-3', 'meta', 'Llama 3', 8192, 0.03, 0.05, T, [['70b', '70B'], ['8b', '8B']]));
entries.push(...F('llama-2', 'meta', 'Llama 2', 4096, 0.03, 0.05, T, [['70b', '70B'], ['13b', '13B'], ['7b', '7B']]));
entries.push(...F('codellama', 'meta', 'Code Llama', 16384, 0.03, 0.05, ['code'], [['70b', '70B', 4096], ['34b', '34B'], ['13b', '13B'], ['7b', '7B']]));

// ── Mistral ──────────────────────────────────────────────────────────────────
entries.push(...F('mistral-large', 'mistral', 'Mistral Large', 128000, 2, 6, ['code', 'math', 'structured'], [['', ''], ['2', '2', 128000, 2, 6], ['latest', 'Latest']]));
entries.push(...F('mistral-medium', 'mistral', 'Mistral Medium', 32000, 2.7, 8.1, T, [['', ''], ['latest', 'Latest']]));
entries.push(...F('mistral-small', 'mistral', 'Mistral Small', 32000, 0.2, 0.6, T, [['', ''], ['3', '3', 32000, 0.1, 0.3], ['latest', 'Latest']]));
entries.push(...F('mistral-tiny', 'mistral', 'Mistral Tiny', 32000, 0.25, 0.25, T, [['', '']]));
entries.push(...F('mistral-embed', 'mistral', 'Mistral Embed', 8000, 0.1, 0.1, ['structured'], [['', '']]));
entries.push(...F('ministral', 'mistral', 'Ministral', 128000, 0.1, 0.1, T, [['8b', '8B'], ['3b', '3B']]));
entries.push(...F('pixtral', 'mistral', 'Pixtral', 128000, 0.2, 0.6, ['vision', 'structured'], [['large', 'Large', 128000, 2, 6], ['12b', '12B']]));
entries.push(...F('codestral', 'mistral', 'Codestral', 32768, 0.3, 0.9, ['code'], [['', ''], ['mamba', 'Mamba', 256000], ['latest', 'Latest']]));
entries.push(...F('open-mixtral', 'mistral', 'Open Mixtral', 32768, 0.7, 0.7, T, [['8x22b', '8x22B', 64000, 2, 6], ['8x7b', '8x7B']]));
entries.push(...F('mistral', 'mistral', 'Mistral', 32768, 0.2, 0.2, T, [['7b', '7B Instruct'], ['nemo', 'NeMo 12B', 128000, 0.15, 0.15]]));

// ── DeepSeek ─────────────────────────────────────────────────────────────────
entries.push(...F('deepseek-chat', 'deepseek', 'DeepSeek Chat', 128000, 0.27, 1.1, ['code', 'math', 'structured'], [['', '']]));
entries.push(...F('deepseek-reasoner', 'deepseek', 'DeepSeek Reasoner', 128000, 0.55, 2.19, ['code', 'math'], [['', '']]));
entries.push(...F('deepseek-coder', 'deepseek', 'DeepSeek Coder', 128000, 0.14, 0.28, ['code'], [['', '']]));
entries.push(...F('deepseek-v2', 'deepseek', 'DeepSeek V2', 128000, 0.27, 1.1, ['code', 'math', 'structured'], [['', ''], ['5', '2.5', 128000, 0.27, 1.1]]));
entries.push(...F('deepseek-r1', 'deepseek', 'DeepSeek R1', 128000, 0.55, 2.19, ['code', 'math'], [['distill-qwen-32b', 'Distill Qwen 32B', 32768, 0.05, 0.1], ['distill-qwen-14b', 'Distill Qwen 14B', 32768, 0.03, 0.06], ['distill-llama-70b', 'Distill Llama 70B', 32768, 0.1, 0.2], ['distill-llama-8b', 'Distill Llama 8B', 32768, 0.02, 0.04]]));

// ── Qwen / Alibaba ───────────────────────────────────────────────────────────
entries.push(...F('qwen3', 'alibaba', 'Qwen3', 131072, 0.1, 0.3, ['code', 'math', 'structured'], [['235b', '235B', 131072, 0.4, 1.2], ['32b', '32B', 131072, 0.06, 0.18], ['30b', '30B A3B', 131072, 0.06, 0.18], ['14b', '14B', 131072, 0.03, 0.09], ['8b', '8B', 131072, 0.02, 0.06], ['4b', '4B', 131072, 0.01, 0.03], ['1.7b', '1.7B', 131072, 0.005, 0.015], ['0.6b', '0.6B', 131072, 0.002, 0.006]]));
entries.push(...F('qwen2.5', 'alibaba', 'Qwen 2.5', 131072, 0.1, 0.3, ['code', 'math', 'structured'], [['max', 'Max', 32768, 1.6, 6.4], ['72b', '72B', 131072, 0.3, 0.9], ['32b', '32B', 131072, 0.15, 0.45], ['14b', '14B', 131072, 0.08, 0.24], ['7b', '7B', 131072, 0.04, 0.12], ['3b', '3B', 32768, 0.02, 0.06], ['1.5b', '1.5B', 32768, 0.01, 0.03], ['0.5b', '0.5B', 32768, 0.005, 0.015]]));
entries.push(...F('qwen2.5-coder', 'alibaba', 'Qwen 2.5 Coder', 131072, 0.1, 0.3, ['code'], [['32b', '32B'], ['14b', '14B'], ['7b', '7B'], ['3b', '3B'], ['1.5b', '1.5B'], ['0.5b', '0.5B']]));
entries.push(...F('qwen2', 'alibaba', 'Qwen 2', 131072, 0.05, 0.15, T, [['72b', '72B'], ['57b', '57B A14B'], ['7b', '7B'], ['1.5b', '1.5B']]));
entries.push(...F('qwen', 'alibaba', 'Qwen', 32768, 0.02, 0.06, T, [['max', 'Max'], ['plus', 'Plus'], ['turbo', 'Turbo'], ['long', 'Long'], ['vl-max', 'VL Max', 32768, 0.1, 0.3, VISION], ['vl-plus', 'VL Plus', 32768, 0.05, 0.15, VISION]]));

// ── Cohere ───────────────────────────────────────────────────────────────────
entries.push(...F('command-a', 'cohere', 'Command A', 256000, 2.5, 10, ['code', 'math', 'structured'], [['', '']]));
entries.push(...F('command-r-plus', 'cohere', 'Command R+', 128000, 2.5, 10, T, [['', ''], ['latest', 'Latest']]));
entries.push(...F('command-r', 'cohere', 'Command R', 128000, 0.5, 1.5, T, [['', ''], ['latest', 'Latest']]));
entries.push(...F('command', 'cohere', 'Command', 4096, 1, 2, T, [['', ''], ['light', 'Light'], ['nightly', 'Nightly']]));
entries.push(...F('aya', 'cohere', 'Aya', 8192, 0.1, 0.3, ['structured'], [['101', '101', 8192, 0.5, 1.5], ['23-8b', '23 8B', 8192, 0.03, 0.09], ['23-35b', '23 35B', 8192, 0.1, 0.3]]));

// ── AI21 ─────────────────────────────────────────────────────────────────────
entries.push(...F('jamba-1.5', 'ai21', 'Jamba 1.5', 256000, 2, 8, ['code', 'structured'], [['large', 'Large'], ['mini', 'Mini', 256000, 0.2, 0.4]]));
entries.push(...F('jamba', 'ai21', 'Jamba', 256000, 5, 5, T, [['large', 'Large'], ['mini', 'Mini', 256000, 0.2, 0.4]]));
entries.push(...F('j2', 'ai21', 'Jurassic-2', 8192, 15, 15, T, [['ultra', 'Ultra'], ['mid', 'Mid'], ['light', 'Light']]));

// ── NVIDIA ───────────────────────────────────────────────────────────────────
entries.push(...F('nemotron-4', 'nvidia', 'Nemotron 4', 4096, 0.5, 1, T, [['340b', '340B']]));
entries.push(...F('nemotron', 'nvidia', 'Nemotron', 131072, 0.1, 0.2, T, [['70b', '70B'], ['llama-3.1-70b', 'Llama 3.1 70B'], ['llama-3.2-3b', 'Llama 3.2 3B']]));
entries.push(...F('llama-3.1-nemotron', 'nvidia', 'Llama 3.1 Nemotron', 131072, 0.1, 0.2, T, [['70b', '70B Instruct']]));

// ── Amazon ───────────────────────────────────────────────────────────────────
entries.push(...F('nova', 'amazon', 'Nova', 300000, 0.8, 3.2, ['code', 'math', 'structured', 'vision'], [['pro', 'Pro', 300000, 0.8, 3.2], ['lite', 'Lite', 300000, 0.06, 0.24], ['micro', 'Micro', 128000, 0.035, 0.14]]));
entries.push(...F('titan-text', 'amazon', 'Titan Text', 8192, 0.3, 0.4, T, [['express', 'Express'], ['lite', 'Lite'], ['premier', 'Premier']]));

// ── Microsoft ────────────────────────────────────────────────────────────────
entries.push(...F('phi-4', 'microsoft', 'Phi-4', 16384, 0.02, 0.06, ['code', 'math'], [['', ''], ['mini', 'Mini', 16384, 0.01, 0.03]]));
entries.push(...F('phi-3.5', 'microsoft', 'Phi 3.5', 131072, 0.01, 0.03, ['code', 'math'], [['mini', 'Mini', 131072, 0.01, 0.03]]));
entries.push(...F('phi-3', 'microsoft', 'Phi 3', 4096, 0.01, 0.03, ['code', 'math'], [['medium', 'Medium', 4096, 0.02, 0.06], ['small', 'Small', 8192, 0.01, 0.03], ['mini', 'Mini', 4096, 0.01, 0.03], ['vision', 'Vision', 128000, 0.05, 0.15, VISION]]));
entries.push(...F('phi-2', 'microsoft', 'Phi 2', 2048, 0.005, 0.015, T, [['', '']]));
entries.push(...F('wizardlm-2', 'microsoft', 'WizardLM 2', 32768, 0.1, 0.3, T, [['8x22b', '8x22B', 65536, 0.4, 0.8], ['7b', '7B']]));

// ── Databricks / Snowflake / IBM / Intel ─────────────────────────────────────
entries.push(...F('dbrx', 'databricks', 'DBRX', 32768, 0.6, 0.6, T, [['instruct', 'Instruct']]));
entries.push(...F('arctic', 'snowflake', 'Arctic', 4096, 0.1, 0.2, T, [['', ''], ['embed', 'Embed']]));
entries.push(...F('granite-3.2', 'ibm', 'Granite 3.2', 128000, 0.01, 0.03, ['code', 'structured'], [['8b', '8B'], ['2b', '2B']]));
entries.push(...F('granite-3.1', 'ibm', 'Granite 3.1', 131072, 0.01, 0.03, T, [['8b', '8B'], ['2b', '2B']]));
entries.push(...F('granite-3.0', 'ibm', 'Granite 3.0', 4096, 0.01, 0.03, T, [['8b', '8B'], ['2b', '2B']]));
entries.push(...F('granite-code', 'ibm', 'Granite Code', 128000, 0.01, 0.03, ['code'], [['34b', '34B'], ['20b', '20B'], ['8b', '8B'], ['3b', '3B']]));
entries.push(...F('neural-chat', 'intel', 'Neural Chat', 8192, 0.02, 0.04, T, [['7b', '7B']]));

// ── Perplexity ───────────────────────────────────────────────────────────────
entries.push(...F('sonar', 'perplexity', 'Sonar', 127000, 1, 1, ['structured'], [['', ''], ['pro', 'Pro', 200000, 3, 15], ['deep-research', 'Deep Research', 127000, 5, 20]]));
entries.push(...F('llama-3.1-sonar', 'perplexity', 'Llama 3.1 Sonar', 131072, 1, 1, T, [['huge', 'Huge 128K'], ['large', 'Large 128K'], ['small', 'Small 128K']]));
entries.push(...F('mixtral-8x7b', 'perplexity', 'Mixtral 8x7B Instruct', 16384, 0.6, 0.6, T, [['instruct', 'Instruct']]));

// ── Chinese labs ─────────────────────────────────────────────────────────────
entries.push(...F('glm-4', 'zhipu', 'GLM-4', 128000, 1, 1, ['code', 'math', 'structured', 'vision'], [['plus', 'Plus', 128000, 7, 7], ['air', 'Air', 8192, 0.14, 0.14], ['flash', 'Flash', 128000, 0.014, 0.014], ['9b', '9B', 128000, 0.02, 0.06], ['v', 'V', 8192, 1, 1, VISION], ['v-plus', 'V Plus', 8192, 1, 1, VISION]]));
entries.push(...F('moonshot-v1', 'moonshot', 'Moonshot v1', 32768, 0.4, 0.4, ['code', 'structured'], [['8k', '8K', 8192, 1.7, 1.7], ['32k', '32K', 32768, 4.2, 4.2], ['128k', '128K', 131072, 4.2, 4.2]]));
entries.push(...F('kimi', 'moonshot', 'Kimi', 131072, 0.4, 0.4, ['code', 'structured'], [['k2', 'K2', 131072, 0.2, 0.6], ['latest', 'Latest'], ['k2-thinking', 'K2 Thinking', 131072, 0.2, 0.6]]));
entries.push(...F('abab', 'minimax', 'ABAB', 245760, 1, 1, T, [['6.5s', '6.5s', 245760, 1, 1], ['6.5', '6.5', 8192, 1, 1], ['6.5s-chat', '6.5s Chat', 245760, 1, 1]]));
entries.push(...F('minimax-m1', 'minimax', 'MiniMax M1', 1000000, 0.1, 0.3, ['code', 'math'], [['', '']]));
entries.push(...F('ernie-4.0', 'baidu', 'Ernie 4.0', 8192, 1, 1, ['code', 'math', 'structured'], [['turbo', 'Turbo 8K'], ['8k', '8K', 8192, 1, 1]]));
entries.push(...F('ernie-3.5', 'baidu', 'Ernie 3.5', 8192, 0.12, 0.12, T, [['8k', '8K'], ['128k', '128K', 131072]]));
entries.push(...F('ernie', 'baidu', 'Ernie', 8192, 0.05, 0.05, T, [['speed-8k', 'Speed 8K'], ['speed-128k', 'Speed 128K', 131072], ['lite-8k', 'Lite 8K'], ['tiny-8k', 'Tiny 8K']]));
entries.push(...F('yi', '01-ai', 'Yi', 32768, 0.1, 0.2, ['code', 'math', 'structured'], [['large', 'Large'], ['medium', 'Medium'], ['34b', '34B'], ['6b', '6B'], ['vision', 'Vision', 4096, 0.1, 0.2, VISION]]));
entries.push(...F('internlm2.5', 'internlm', 'InternLM 2.5', 32768, 0.05, 0.1, T, [['20b', '20B'], ['7b', '7B']]));
entries.push(...F('internlm3', 'internlm', 'InternLM 3', 32768, 0.05, 0.1, T, [['8b', '8B']]));
entries.push(...F('baichuan2', 'baichuan', 'Baichuan 2', 4096, 0.02, 0.04, T, [['13b', '13B'], ['7b', '7B']]));
entries.push(...F('baichuan4', 'baichuan', 'Baichuan 4', 32768, 0.1, 0.2, T, [['', ''], ['air', 'Air'], ['turbo', 'Turbo']]));
entries.push(...F('minicpm', 'openbmb', 'MiniCPM', 8192, 0.01, 0.03, T, [['4b', '4B'], ['2b', '2B'], ['v', 'V', 8192, 0.05, 0.15, VISION]]));
entries.push(...F('hunyuan', 'tencent', 'Hunyuan', 32768, 0.1, 0.2, ['code', 'structured'], [['turbo', 'Turbo'], ['lite', 'Lite'], ['standard', 'Standard'], ['pro', 'Pro']]));
entries.push(...F('skywork', 'kunlun', 'Skywork', 8192, 0.02, 0.04, T, [['chat', 'Chat']]));
entries.push(...F('telechat', 'telecom-ai', 'TeleChat', 4096, 0.02, 0.04, T, [['2', '2'], ['3', '3']]));

// ── Upstage / Reka / Other challengers ───────────────────────────────────────
entries.push(...F('solar-pro', 'upstage', 'Solar Pro', 4096, 0.1, 0.2, T, [['preview', 'Preview']]));
entries.push(...F('solar-mini', 'upstage', 'Solar Mini', 4096, 0.05, 0.1, T, [['', ''], ['ja', 'JA']]));
entries.push(...F('solar-1', 'upstage', 'Solar 1', 4096, 0.03, 0.06, T, [['mini', 'Mini'], ['mini-chat', 'Mini Chat'], ['mini-chat-ja', 'Mini Chat JA']]));
entries.push(...F('reka-core', 'reka', 'Reka Core', 128000, 10, 25, ['code', 'math', 'structured', 'vision'], [['', '']]));
entries.push(...F('reka-flash', 'reka', 'Reka Flash', 128000, 0.8, 2, ['code', 'structured', 'vision'], [['', '']]));
entries.push(...F('reka-edge', 'reka', 'Reka Edge', 128000, 0.4, 1, ['structured'], [['', '']]));
entries.push(...F('marco-o1', 'alibaba', 'Marco o1', 131072, 0.1, 0.3, ['math', 'code'], [['', '']]));
entries.push(...F('dracarys', 'abacus', 'Dracarys', 131072, 0.1, 0.3, T, [['72b', '72B']]));
entries.push(...F('smaug', 'abacus', 'Smaug', 32768, 0.1, 0.3, T, [['72b', '72B']]));
entries.push(...F('magnum', 'anthracite', 'Magnum', 8192, 0.05, 0.1, T, [['v4', 'v4 72B'], ['v3', 'v3 34B'], ['v2', 'v2 72B']]));
entries.push(...F('euryale', 'sao10k', 'Euryale', 32768, 0.05, 0.1, ['creative'], [['v2.2', 'v2.2 70B'], ['v2.1', 'v2.1 70B']]));
entries.push(...F('l3', 'sao10k', 'L3', 8192, 0.05, 0.1, ['creative'], [['8b-stheno-v3.2', '8B Stheno v3.2'], ['70b-euryale-v2.1', '70B Euryale v2.1']]));
entries.push(...F('llama-3.1-supernova', 'arcee', 'Llama 3.1 SuperNova', 131072, 0.1, 0.2, T, [['lite', 'Lite']]));
entries.push(...F('qwen2.5-uncensored', 'featherless', 'Qwen 2.5 Uncensored', 32768, 0.05, 0.1, T, [['', '']]));
entries.push(...F('dolphin', 'cognitive', 'Dolphin', 32768, 0.05, 0.1, TC, [['mixtral-8x22b', 'Mixtral 8x22B', 64000], ['mixtral-8x7b', 'Mixtral 8x7B'], ['llama-3-70b', 'Llama 3 70B'], ['llama-3-8b', 'Llama 3 8B']]));
entries.push(...F('hermes-3', 'nous', 'Hermes 3', 131072, 0.1, 0.2, ['code', 'structured'], [['llama-3.1-405b', 'Llama 3.1 405B'], ['llama-3.1-70b', 'Llama 3.1 70B'], ['llama-3.1-8b', 'Llama 3.1 8B']]));
entries.push(...F('nous-hermes-2', 'nous', 'Nous Hermes 2', 32768, 0.05, 0.1, ['code', 'structured'], [['mixtral-8x7b-dpo', 'Mixtral 8x7B DPO'], ['yi-34b', 'Yi 34B'], ['llama-70b', 'Llama 70B'], ['llama-13b', 'Llama 13B']]));

// ── Open-source labs: falcon / stability / AI2 / bigcode / lmsys ────────────
entries.push(...F('falcon', 'tii', 'Falcon', 2048, 0.02, 0.04, T, [['180b', '180B', 2048, 0.1, 0.2], ['40b', '40B'], ['7b', '7B'], ['mamba-7b', 'Mamba 7B']]));
entries.push(...F('stablelm-2', 'stability', 'StableLM 2', 4096, 0.01, 0.02, T, [['12b', '12B'], ['1.6b', '1.6B'], ['zephyr-1.6b', 'Zephyr 1.6B']]));
entries.push(...F('stable-code', 'stability', 'Stable Code', 16384, 0.01, 0.02, ['code'], [['3b', '3B'], ['instruct-3b', 'Instruct 3B']]));
entries.push(...F('olmo-2', 'ai2', 'OLMo 2', 4096, 0.02, 0.04, T, [['13b', '13B'], ['7b', '7B']]));
entries.push(...F('olmo', 'ai2', 'OLMo', 2048, 0.02, 0.04, T, [['7b', '7B Instruct'], ['1.7-7b', '1.7 7B']]));
entries.push(...F('starcoder2', 'bigcode', 'StarCoder2', 16384, 0.01, 0.03, ['code'], [['15b', '15B'], ['7b', '7B'], ['3b', '3B']]));
entries.push(...F('starcoder', 'bigcode', 'StarCoder', 8192, 0.01, 0.03, ['code'], [['', ''], ['plus', 'Plus']]));
entries.push(...F('vicuna', 'lmsys', 'Vicuna', 4096, 0.02, 0.04, T, [['33b', '33B'], ['13b', '13B'], ['7b', '7B']]));
entries.push(...F('zephyr', 'huggingface', 'Zephyr', 32768, 0.02, 0.04, T, [['7b-beta', '7B Beta'], ['7b-alpha', '7B Alpha']]));
entries.push(...F('bloom', 'bigscience', 'BLOOM', 2048, 0.02, 0.04, T, [['', ''], ['z', 'Z', 2048, 0.02, 0.04]]));
entries.push(...F('mamba', 'state-spaces', 'Mamba', 2048, 0.01, 0.02, T, [['2.8b', '2.8B']]));
entries.push(...F('openchat', 'openchat', 'OpenChat', 8192, 0.02, 0.04, T, [['3.6', '3.6'], ['3.5', '3.5']]));
entries.push(...F('wizard-vicuna', 'jartine', 'Wizard Vicuna', 2048, 0.02, 0.04, T, [['30b', '30B'], ['13b', '13B']]));
entries.push(...F('mythomax', 'gryphe', 'MythoMax', 4096, 0.02, 0.04, ['creative'], [['l2-13b', 'L2 13B']]));
entries.push(...F('mixtral-8x22b', 'mistralai', 'Mixtral 8x22B Instruct', 65536, 0.6, 0.6, T, [['instruct', 'Instruct']]));

// ── Hosted-fast providers (Groq / Together / Fireworks / HF) ─────────────────
entries.push(...F('llama-3.3-70b-versatile', 'groq', 'Llama 3.3 70B Versatile', 128000, 0.59, 0.79, T, [['', '']]));
entries.push(...F('llama-3.1-8b-instant', 'groq', 'Llama 3.1 8B Instant', 131072, 0.05, 0.08, T, [['', '']]));
entries.push(...F('llama3-70b', 'groq', 'Llama 3 70B', 8192, 0.59, 0.79, T, [['8192', '8192']]));
entries.push(...F('llama3-8b', 'groq', 'Llama 3 8B', 8192, 0.05, 0.08, T, [['8192', '8192']]));
entries.push(...F('gemma2-9b-it', 'groq', 'Gemma 2 9B IT', 8192, 0.03, 0.03, T, [['', '']]));
entries.push(...F('mixtral-8x7b-32768', 'groq', 'Mixtral 8x7B 32K', 32768, 0.24, 0.24, T, [['', '']]));
entries.push(...F('qwen-qwq-32b', 'groq', 'Qwen QwQ 32B', 131072, 0.29, 0.39, ['math', 'code'], [['', '']]));
entries.push(...F('deepseek-r1-distill-llama-70b', 'groq', 'DeepSeek R1 Distill Llama 70B', 131072, 0.75, 0.99, ['math', 'code'], [['', '']]));
entries.push(...F('stripedhyena', 'together', 'StripedHyena', 131072, 0.1, 0.2, T, [['nous-7b', 'Nous 7B']]));
entries.push(...F('hermes-2', 'together', 'Hermes 2', 32768, 0.05, 0.1, ['code', 'structured'], [['mixtral-8x7b-dpo', 'Mixtral 8x7B DPO']]));
entries.push(...F('firefunction', 'fireworks', 'FireFunction', 32768, 0.05, 0.1, ['code', 'structured'], [['v2', 'v2']]));
entries.push(...F('f1', 'fireworks', 'F1', 32768, 0.05, 0.1, ['structured'], [['', ''], ['preview', 'Preview']]));

// ── Image + video generation (gateway txt2img/txt2vid) ──────────────────────
entries.push(...F('flux-1.1', 'black-forest-labs', 'FLUX 1.1', 0, 0, 0, ['creative'], [['pro', 'Pro']]));
entries.push(...F('flux', 'black-forest-labs', 'FLUX', 0, 0, 0, ['creative'], [['schnell', 'Schnell'], ['dev', 'Dev'], ['pro', 'Pro']]));
entries.push(...F('stable-diffusion', 'stability', 'Stable Diffusion', 0, 0, 0, ['creative'], [['3.5', '3.5'], ['3', '3'], ['xl', 'XL'], ['xl-turbo', 'XL Turbo']]));
entries.push(...F('nano-banana', 'google', 'Nano Banana', 0, 0, 0, ['creative'], [['', ''], ['pro', 'Pro']]));
entries.push(...F('seedream', 'bytedance', 'Seedream', 0, 0, 0, ['creative'], [['4', '4'], ['3', '3']]));
entries.push(...F('kling', 'kuaishou', 'Kling', 0, 0, 0, ['creative'], [['v1.6', 'v1.6'], ['v1.5', 'v1.5']]));
entries.push(...F('veo', 'google', 'Veo', 0, 0, 0, ['creative'], [['3', '3'], ['2', '2']]));
entries.push(...F('wan', 'alibaba', 'Wan', 0, 0, 0, ['creative'], [['2.1', '2.1'], ['2.2', '2.2']]));
entries.push(...F('sora', 'openai', 'Sora', 0, 0, 0, ['creative'], [['', ''], ['turbo', 'Turbo']]));
entries.push(...F('luma', 'luma', 'Luma', 0, 0, 0, ['creative'], [['photon', 'Photon'], ['dream-machine', 'Dream Machine']]));
entries.push(...F('recraft', 'recraft', 'Recraft', 0, 0, 0, ['creative'], [['v3', 'V3'], ['20b', '20B']]));
entries.push(...F('ideogram', 'ideogram', 'Ideogram', 0, 0, 0, ['creative'], [['v3', 'V3'], ['v2', 'V2']]));
entries.push(...F('midjourney', 'midjourney', 'Midjourney', 0, 0, 0, ['creative'], [['v7', 'V7'], ['v6.1', 'V6.1']]));
entries.push(...F('playground', 'playground', 'Playground', 0, 0, 0, ['creative'], [['v3', 'V3'], ['v2.5', 'V2.5']]));
entries.push(...F('mobius', 'black-forest-labs', 'Mobius', 0, 0, 0, ['creative'], [['', '']]));


// ── instruct/chat alias variants (real ids used across gateways) ────────────
entries.push(...F('llama-3.1-8b', 'meta', 'Llama 3.1 8B', 131072, 0.03, 0.05, T, [['instruct', 'Instruct'], ['chat', 'Chat']]));
entries.push(...F('llama-3.1-70b', 'meta', 'Llama 3.1 70B', 131072, 0.2, 0.5, T, [['instruct', 'Instruct'], ['chat', 'Chat']]));
entries.push(...F('llama-3.1-405b', 'meta', 'Llama 3.1 405B', 131072, 0.8, 0.9, T, [['instruct', 'Instruct'], ['chat', 'Chat']]));
entries.push(...F('llama-3.2-1b', 'meta', 'Llama 3.2 1B', 131072, 0.01, 0.02, T, [['instruct', 'Instruct']]));
entries.push(...F('llama-3.2-3b', 'meta', 'Llama 3.2 3B', 131072, 0.015, 0.025, T, [['instruct', 'Instruct']]));
entries.push(...F('llama-3-8b', 'meta', 'Llama 3 8B', 8192, 0.03, 0.05, T, [['instruct', 'Instruct'], ['chat', 'Chat']]));
entries.push(...F('llama-3-70b', 'meta', 'Llama 3 70B', 8192, 0.2, 0.5, T, [['instruct', 'Instruct'], ['chat', 'Chat']]));
entries.push(...F('llama-2-7b', 'meta', 'Llama 2 7B', 4096, 0.02, 0.04, T, [['chat', 'Chat']]));
entries.push(...F('llama-2-13b', 'meta', 'Llama 2 13B', 4096, 0.03, 0.06, T, [['chat', 'Chat']]));
entries.push(...F('llama-2-70b', 'meta', 'Llama 2 70B', 4096, 0.1, 0.2, T, [['chat', 'Chat']]));
entries.push(...F('gemma-2-9b', 'google', 'Gemma 2 9B', 8192, 0.06, 0.06, T, [['it', 'IT']]));
entries.push(...F('gemma-2-27b', 'google', 'Gemma 2 27B', 8192, 0.27, 0.27, T, [['it', 'IT']]));
entries.push(...F('qwen2.5-7b', 'alibaba', 'Qwen 2.5 7B', 131072, 0.04, 0.12, T, [['instruct', 'Instruct']]));
entries.push(...F('qwen2.5-14b', 'alibaba', 'Qwen 2.5 14B', 131072, 0.08, 0.24, T, [['instruct', 'Instruct']]));
entries.push(...F('qwen2.5-32b', 'alibaba', 'Qwen 2.5 32B', 131072, 0.15, 0.45, T, [['instruct', 'Instruct']]));
entries.push(...F('qwen2.5-72b', 'alibaba', 'Qwen 2.5 72B', 131072, 0.3, 0.9, T, [['instruct', 'Instruct']]));
entries.push(...F('mistral-7b-instruct', 'mistral', 'Mistral 7B Instruct', 32768, 0.06, 0.06, T, [['v0.3', 'v0.3'], ['v0.2', 'v0.2'], ['v0.1', 'v0.1']]));
entries.push(...F('mixtral-8x7b-instruct', 'mistral', 'Mixtral 8x7B Instruct', 32768, 0.24, 0.24, T, [['v0.1', 'v0.1']]));
entries.push(...F('codellama-34b', 'meta', 'Code Llama 34B', 16384, 0.03, 0.05, ['code'], [['instruct', 'Instruct'], ['python', 'Python']]));
entries.push(...F('codellama-13b', 'meta', 'Code Llama 13B', 16384, 0.02, 0.04, ['code'], [['instruct', 'Instruct'], ['python', 'Python']]));
entries.push(...F('codellama-7b', 'meta', 'Code Llama 7B', 16384, 0.01, 0.02, ['code'], [['instruct', 'Instruct'], ['python', 'Python']]));
entries.push(...F('phi-3-mini-4k', 'microsoft', 'Phi 3 Mini 4K', 4096, 0.01, 0.03, ['code', 'math'], [['instruct', 'Instruct']]));
entries.push(...F('phi-3-mini-128k', 'microsoft', 'Phi 3 Mini 128K', 131072, 0.01, 0.03, ['code', 'math'], [['instruct', 'Instruct']]));
entries.push(...F('starcoder2-15b', 'bigcode', 'StarCoder2 15B', 16384, 0.01, 0.03, ['code'], [['instruct', 'Instruct']]));
entries.push(...F('falcon-7b', 'tii', 'Falcon 7B', 2048, 0.02, 0.04, T, [['instruct', 'Instruct']]));
entries.push(...F('falcon-40b', 'tii', 'Falcon 40B', 2048, 0.05, 0.1, T, [['instruct', 'Instruct']]));
entries.push(...F('vicuna-7b-v1.5', 'lmsys', 'Vicuna 7B v1.5', 4096, 0.02, 0.04, T, [['', '']]));
entries.push(...F('vicuna-13b-v1.5', 'lmsys', 'Vicuna 13B v1.5', 4096, 0.03, 0.06, T, [['', '']]));
entries.push(...F('nous-hermes-2-mixtral-8x7b', 'nous', 'Nous Hermes 2 Mixtral 8x7B', 32768, 0.06, 0.06, T, [['dpo', 'DPO'], ['sft', 'SFT']]));
entries.push(...F('openhermes-2.5', 'teknium', 'OpenHermes 2.5', 4096, 0.02, 0.04, T, [['mistral-7b', 'Mistral 7B']]));
entries.push(...F('orca-2', 'microsoft', 'Orca 2', 4096, 0.02, 0.04, ['math'], [['13b', '13B'], ['7b', '7B']]));
entries.push(...F('deepseek-llm', 'deepseek', 'DeepSeek LLM', 4096, 0.02, 0.04, ['code', 'structured'], [['67b', '67B Chat'], ['7b', '7B Chat']]));
entries.push(...F('deepseek-math', 'deepseek', 'DeepSeek Math', 4096, 0.02, 0.04, ['math'], [['7b', '7B Instruct']]));
entries.push(...F('deepseek-coder-v2', 'deepseek', 'DeepSeek Coder V2', 131072, 0.14, 0.28, ['code'], [['lite', 'Lite']]));
entries.push(...F('chatglm3', 'zhipu', 'ChatGLM3', 8192, 0.02, 0.04, ['code', 'structured'], [['6b', '6B'], ['6b-32k', '6B 32K', 32768]]));
entries.push(...F('glm-4-9b', 'zhipu', 'GLM-4 9B', 131072, 0.02, 0.06, ['code', 'structured'], [['chat', 'Chat']]));
entries.push(...F('baichuan-13b', 'baichuan', 'Baichuan 13B', 4096, 0.02, 0.04, T, [['chat', 'Chat'], ['base', 'Base']]));
entries.push(...F('yi-34b-chat', '01-ai', 'Yi 34B Chat', 4096, 0.05, 0.1, T, [['', '']]));
entries.push(...F('yi-6b-chat', '01-ai', 'Yi 6B Chat', 4096, 0.02, 0.04, T, [['', '']]));
entries.push(...F('internlm2-chat', 'internlm', 'InternLM 2 Chat', 32768, 0.05, 0.1, T, [['20b', '20B'], ['7b', '7B']]));
entries.push(...F('internlm2.5-chat', 'internlm', 'InternLM 2.5 Chat', 32768, 0.05, 0.1, T, [['20b', '20B'], ['7b', '7B']]));
entries.push(...F('mythomax-l2', 'gryphe', 'MythoMax L2', 4096, 0.02, 0.04, ['creative'], [['13b', '13B'], ['13b-8k', '13B 8K', 8192]]));
entries.push(...F('noromaid', 'nothingiisreal', 'Noromaid', 8192, 0.02, 0.04, ['creative'], [['20b', '20B'], ['mixtral-8x7b', 'Mixtral 8x7B']]));
entries.push(...F('wizardlm', 'microsoft', 'WizardLM', 4096, 0.02, 0.04, T, [['13b-v1.2', '13B v1.2'], ['7b-v1.0', '7B v1.0']]));
entries.push(...F('openchat-7b', 'openchat', 'OpenChat 7B', 8192, 0.02, 0.04, T, [['', '']]));
entries.push(...F('aya-23', 'cohere', 'Aya 23', 8192, 0.05, 0.1, ['structured'], [['35b', '35B'], ['8b', '8B']]));
entries.push(...F('jamba-instruct', 'ai21', 'Jamba Instruct', 256000, 0.5, 0.7, T, [['', '']]));
entries.push(...F('jamba-1.5-large-instruct', 'ai21', 'Jamba 1.5 Large Instruct', 256000, 2, 8, ['code', 'structured'], [['', '']]));
entries.push(...F('jamba-1.5-mini-instruct', 'ai21', 'Jamba 1.5 Mini Instruct', 256000, 0.2, 0.4, ['code', 'structured'], [['', '']]));
entries.push(...F('command-r7b', 'cohere', 'Command R7B', 128000, 0.03, 0.09, T, [['', '']]));
entries.push(...F('command-r-plus-08', 'cohere', 'Command R+ 08', 128000, 2.5, 10, T, [['2024', '2024']]));
entries.push(...F('command-r-08', 'cohere', 'Command R 08', 128000, 0.5, 1.5, T, [['2024', '2024']]));
entries.push(...F('granite-20b', 'ibm', 'Granite 20B', 8192, 0.02, 0.04, T, [['code', 'Code']]));
entries.push(...F('granite-8b', 'ibm', 'Granite 8B', 4096, 0.01, 0.03, T, [['code', 'Code'], ['instruct', 'Instruct']]));
entries.push(...F('solar-1-mini-chat', 'upstage', 'Solar 1 Mini Chat', 4096, 0.03, 0.06, T, [['', '']]));
entries.push(...F('gpt-neox', 'eleutherai', 'GPT-NeoX', 2048, 0.02, 0.04, T, [['20b', '20B']]));
entries.push(...F('gpt-j', 'eleutherai', 'GPT-J', 2048, 0.01, 0.02, T, [['6b', '6B']]));
entries.push(...F('dolly-v2', 'databricks', 'Dolly v2', 2048, 0.01, 0.02, T, [['12b', '12B'], ['7b', '7B'], ['3b', '3B']]));
entries.push(...F('opt', 'meta', 'OPT', 2048, 0.01, 0.02, T, [['66b', '66B'], ['30b', '30B'], ['13b', '13B'], ['6.7b', '6.7B'], ['2.7b', '2.7B'], ['1.3b', '1.3B']]));
entries.push(...F('pythia', 'eleutherai', 'Pythia', 2048, 0.01, 0.02, T, [['12b', '12B'], ['6.9b', '6.9B'], ['2.8b', '2.8B'], ['1.4b', '1.4B']]));
entries.push(...F('guanaco', 'timdettmers', 'Guanaco', 4096, 0.02, 0.04, T, [['65b', '65B'], ['33b', '33B'], ['13b', '13B'], ['7b', '7B']]));
entries.push(...F('mpt', 'mosaicml', 'MPT', 2048, 0.01, 0.02, T, [['30b', '30B'], ['7b', '7B Instruct'], ['7b-chat', '7B Chat']]));
entries.push(...F('xgen', 'salesforce', 'XGen', 4096, 0.02, 0.04, T, [['7b-8k', '7B 8K'], ['7b-4k', '7B 4K']]));
entries.push(...F('koala', 'berkeley', 'Koala', 2048, 0.02, 0.04, T, [['13b', '13B'], ['7b', '7B']]));
entries.push(...F('oasst', 'laion', 'OpenAssistant', 2048, 0.02, 0.04, T, [['sft-4-12b', 'SFT-4 12B'], ['pythia-12b', 'Pythia 12B']]));
entries.push(...F('redpajama', 'together', 'RedPajama', 2048, 0.02, 0.04, T, [['incite-7b', 'INCITE 7B'], ['incite-3b', 'INCITE 3B']]));

// ── prefixed aggregator ids (vendor/model — the way 500-model gateways list) ──
const PREFIXED = [
  ['openai/gpt-5', 'GPT-5', 400000, 1.25, 10, T], ['openai/gpt-5-mini', 'GPT-5 Mini', 400000, 0.25, 2, T],
  ['openai/gpt-4o', 'GPT-4o', 128000, 2.5, 10, V], ['openai/gpt-4o-mini', 'GPT-4o Mini', 128000, 0.15, 0.6, T],
  ['openai/o3', 'o3', 200000, 10, 40, T], ['openai/o3-mini', 'o3 Mini', 200000, 1.1, 4.4, T],
  ['openai/o4-mini', 'o4 Mini', 200000, 1.1, 4.4, T], ['openai/o1', 'o1', 200000, 15, 60, T],
  ['openai/gpt-4.1', 'GPT-4.1', 1000000, 2, 8, T], ['openai/gpt-4.1-mini', 'GPT-4.1 Mini', 1000000, 0.4, 1.6, T],
  ['anthropic/claude-opus-4', 'Claude Opus 4', 200000, 15, 75, V], ['anthropic/claude-sonnet-4-5', 'Claude Sonnet 4.5', 200000, 3, 15, V],
  ['anthropic/claude-haiku-4-5', 'Claude Haiku 4.5', 200000, 0.8, 4, V], ['anthropic/claude-3-7-sonnet', 'Claude 3.7 Sonnet', 200000, 3, 15, V],
  ['anthropic/claude-3-5-sonnet', 'Claude 3.5 Sonnet', 200000, 3, 15, V], ['anthropic/claude-3-5-haiku', 'Claude 3.5 Haiku', 200000, 0.8, 4, V],
  ['google/gemini-2.5-pro', 'Gemini 2.5 Pro', 1000000, 1.25, 10, V], ['google/gemini-2.5-flash', 'Gemini 2.5 Flash', 1000000, 0.3, 2.5, V],
  ['google/gemini-2.0-flash', 'Gemini 2.0 Flash', 1000000, 0.1, 0.4, V], ['google/gemini-1.5-pro', 'Gemini 1.5 Pro', 2000000, 1.25, 5, V],
  ['x-ai/grok-4', 'Grok 4', 256000, 3, 15, V], ['x-ai/grok-3-mini', 'Grok 3 Mini', 131072, 0.3, 0.5, T],
  ['x-ai/grok-3', 'Grok 3', 131072, 3, 15, V], ['x-ai/grok-2', 'Grok 2', 131072, 2, 10, T],
  ['meta-llama/llama-4-maverick', 'Llama 4 Maverick', 1000000, 0.2, 0.6, V], ['meta-llama/llama-4-scout', 'Llama 4 Scout', 1000000, 0.11, 0.34, V],
  ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct', 128000, 0.12, 0.3, T], ['meta-llama/llama-3.1-405b-instruct', 'Llama 3.1 405B Instruct', 128000, 0.8, 0.9, T],
  ['meta-llama/llama-3.1-70b-instruct', 'Llama 3.1 70B Instruct', 128000, 0.2, 0.5, T], ['meta-llama/llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 128000, 0.03, 0.05, T],
  ['deepseek/deepseek-chat', 'DeepSeek Chat', 128000, 0.27, 1.1, T], ['deepseek/deepseek-reasoner', 'DeepSeek Reasoner', 128000, 0.55, 2.19, T],
  ['mistralai/mistral-large-latest', 'Mistral Large', 128000, 2, 6, T], ['mistralai/mistral-small-latest', 'Mistral Small', 32000, 0.2, 0.6, T],
  ['mistralai/mixtral-8x22b-instruct', 'Mixtral 8x22B Instruct', 65536, 0.6, 0.6, T], ['mistralai/pixtral-large', 'Pixtral Large', 128000, 2, 6, V],
  ['qwen/qwen3-235b-a22b', 'Qwen3 235B A22B', 131072, 0.4, 1.2, T], ['qwen/qwen2.5-72b-instruct', 'Qwen 2.5 72B Instruct', 131072, 0.3, 0.9, T],
  ['qwen/qwen2.5-coder-32b-instruct', 'Qwen 2.5 Coder 32B', 131072, 0.1, 0.3, ['code']], ['qwen/qwq-32b', 'QwQ 32B', 131072, 0.29, 0.39, ['math', 'code']],
  ['cohere/command-r-plus', 'Command R+', 128000, 2.5, 10, T], ['cohere/command-a', 'Command A', 256000, 2.5, 10, T],
  ['nvidia/llama-3.1-nemotron-70b-instruct', 'Nemotron 70B', 131072, 0.1, 0.2, T], ['nvidia/nemotron-4-340b-instruct', 'Nemotron 4 340B', 4096, 0.5, 1, T],
  ['microsoft/phi-4', 'Phi 4', 16384, 0.02, 0.06, ['code', 'math']], ['microsoft/wizardlm-2-8x22b', 'WizardLM 2 8x22B', 65536, 0.4, 0.8, T],
  ['amazon/nova-pro-v1', 'Nova Pro', 300000, 0.8, 3.2, V], ['amazon/nova-lite-v1', 'Nova Lite', 300000, 0.06, 0.24, V],
  ['ai21/jamba-1.5-large', 'Jamba 1.5 Large', 256000, 2, 8, T], ['ai21/jamba-1.5-mini', 'Jamba 1.5 Mini', 256000, 0.2, 0.4, T],
  ['perplexity/sonar', 'Sonar', 127000, 1, 1, T], ['perplexity/sonar-pro', 'Sonar Pro', 200000, 3, 15, T],
  ['perplexity/sonar-deep-research', 'Sonar Deep Research', 127000, 5, 20, T], ['perplexity/llama-3.1-sonar-large-128k', 'Sonar Large 128K', 131072, 1, 1, T],
  ['mistralai/codestral', 'Codestral', 32768, 0.3, 0.9, ['code']], ['mistralai/codestral-mamba', 'Codestral Mamba', 256000, 0.3, 0.9, ['code']],
  ['google/gemma-3-27b-it', 'Gemma 3 27B', 128000, 0.1, 0.1, V], ['google/gemma-2-27b-it', 'Gemma 2 27B', 8192, 0.27, 0.27, T],
  ['moonshotai/kimi-k2', 'Kimi K2', 131072, 0.2, 0.6, T], ['moonshotai/moonshot-v1-32k', 'Moonshot v1 32K', 32768, 4.2, 4.2, T],
  ['z-ai/glm-4-plus', 'GLM-4 Plus', 128000, 7, 7, V], ['z-ai/glm-4-air', 'GLM-4 Air', 8192, 0.14, 0.14, T],
  ['upstage/solar-pro', 'Solar Pro', 4096, 0.1, 0.2, T], ['upstage/solar-mini', 'Solar Mini', 4096, 0.05, 0.1, T],
  ['databricks/dbrx-instruct', 'DBRX Instruct', 32768, 0.6, 0.6, T], ['snowflake/arctic', 'Arctic', 4096, 0.1, 0.2, T],
  ['reka-core/reka-core', 'Reka Core', 128000, 10, 25, V], ['reka-core/reka-flash', 'Reka Flash', 128000, 0.8, 2, V],
  ['togethercomputer/stripedhermes-nous-7b', 'StripedHermes Nous 7B', 131072, 0.1, 0.2, T], ['togethercomputer/llama-3.3-70b-instruct', 'Llama 3.3 70B', 128000, 0.12, 0.3, T],
  ['fireworks-ai/llama-v3p1-70b-instruct', 'Llama 3.1 70B', 128000, 0.2, 0.5, T], ['fireworks-ai/deepseek-v3', 'DeepSeek V3', 128000, 0.27, 1.1, T],
  ['huggingfaceh4/zephyr-7b-beta', 'Zephyr 7B Beta', 32768, 0.02, 0.04, T], ['bigcode/starcoder2-15b', 'StarCoder2 15B', 16384, 0.01, 0.03, ['code']],
  ['ibm/granite-3.1-8b-instruct', 'Granite 3.1 8B', 131072, 0.01, 0.03, T], ['ai21/j2-ultra', 'J2 Ultra', 8192, 15, 15, T],
];
for (const [id, name, ctx, ci, co, caps] of PREFIXED) {
  entries.push({ id, name, provider: id.split('/')[0], family: 'gateway', contextWindow: ctx, costIn: ci, costOut: co, capabilities: caps });
}

// dedupe by id and emit
const seen = new Set();
const models = entries.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

const header = `/**
 * Puter AI gateway — model catalog (${models.length}+ entries).
 *
 * Puter exposes 500+ models through puter.ai (OpenAI, Anthropic, Google and
 * more). This static catalog makes the gateway browsable even before the
 * live list is loaded, and every id is re-validated against the LIVE
 * puter.ai.listModels() result at runtime (see lib/puter.tsx): live models
 * are marked "live · validated", catalog-only entries show as "catalog".
 *
 * Generated by scripts/gen-puter-catalog.mjs — edit the generator, not this file.
 */
import type { ModelInfo } from '@sutra/shared';

export interface PuterCatalogModel {
  id: string;
  name: string;
  provider: string;
  family: string;
  contextWindow: number;
  costIn: number;  // USD per 1M input tokens (approx, informational)
  costOut: number; // USD per 1M output tokens (approx, informational)
  capabilities: Array<'code' | 'math' | 'long-context' | 'creative' | 'structured' | 'vision'>;
}

export const PUTER_MODEL_CATALOG: PuterCatalogModel[] = ${JSON.stringify(models, null, 1)
  .replace(/"(\w+)":/g, '$1:')
  .replace(/"(-?\d+(?:\.\d+)?)"/g, (m, n) => n)};

/** Catalog entry as a router-visible ModelInfo (runtime: puter-cloud). */
export function catalogModelToInfo(m: PuterCatalogModel): ModelInfo {
  return {
    id: m.id,
    name: m.name,
    provider: 'puter-catalog:' + m.provider,
    runtime: 'puter-cloud',
    contextWindow: m.contextWindow || 128000,
    costIn: m.costIn / 1000,
    costOut: m.costOut / 1000,
    latencyTier: 'medium',
    capabilities: m.capabilities.map((c) => (c === 'vision' ? 'vision' : c)),
    available: true,
    local: false,
  };
}

/** Merge live gateway models over the catalog (live wins, catalog fills gaps). */
export function mergePuterModels(live: Array<{ id: string; name?: string; provider?: string }>): PuterCatalogModel[] {
  const liveById = new Map(live.map((m) => [m.id, m]));
  const merged: PuterCatalogModel[] = [];
  for (const m of PUTER_MODEL_CATALOG) {
    const l = liveById.get(m.id);
    merged.push(l ? { ...m, name: l.name ?? m.name, provider: l.provider ?? m.provider } : m);
    liveById.delete(m.id);
  }
  for (const [id, l] of liveById) {
    merged.push({ id, name: l.name ?? id, provider: l.provider ?? 'puter', family: 'live', contextWindow: 128000, costIn: 0, costOut: 0, capabilities: ['structured'] });
  }
  return merged;
}
`;

const out = path.join(__dirname, '..', 'apps', 'web', 'lib', 'puter-models.ts');
fs.writeFileSync(out, header);
console.log(`wrote ${out} with ${models.length} models`);
