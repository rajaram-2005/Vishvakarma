import { route } from "@/aetheris/lib/router/router";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import type { FileSpec } from "@/aetheris/lib/github/api";

export type Language = "python" | "node" | "java";

export interface ProjectPlan {
  name: string;
  language: Language;
  summary: string;
  files: FileSpec[];
  /** Shell command that runs the tests inside CI. */
  testCommand: string;
}

const CODEGEN_PROMPT = `You are the code generator inside Aetheris One's Cloud Coding Factory.
Given a task, produce a small, self-contained project WITH TESTS that will run on GitHub Actions
(ubuntu-latest). Respond with ONLY a JSON object — no prose, no markdown fences — of this shape:

{
  "name": "kebab-case-project-name",
  "language": "python" | "node" | "java",
  "summary": "one sentence describing what was built",
  "testCommand": "shell command that runs the tests",
  "files": [ { "path": "relative/path.ext", "content": "file contents" } ]
}

Rules:
- python: use pytest; testCommand "python -m pytest -q". Put tests in test_*.py. If deps are needed, include requirements.txt (pytest will be installed automatically).
- node: use the built-in node:test runner, ESM, no dependencies; testCommand "node --test".
- java: use plain JUnit 5 with Maven; include a minimal pom.xml with junit-jupiter 5.10.x and surefire 3.2.x; testCommand "mvn -q -B test".
- Keep it small (2-6 files). No network access at test time. No placeholders or TODOs.
- Escape JSON strings correctly (newlines as \\n).`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return body.slice(start, end + 1);
}

function sanitizePath(p: string): string {
  const clean = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.split("/").some((seg) => seg === ".." || seg === "" || seg === ".github")) {
    throw new Error(`Refusing unsafe path from model: ${p}`);
  }
  return clean;
}

export async function generateProject(task: string, preferred?: string): Promise<{ plan: ProjectPlan; provider: string; model: string }> {
  const messages: ChatMessage[] = [
    { role: "system", content: CODEGEN_PROMPT },
    { role: "user", content: task },
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await route({ messages, preferred, temperature: 0.2, maxTokens: 4000 });
    try {
      const raw = JSON.parse(extractJson(r.content)) as Partial<ProjectPlan>;
      if (!raw.files?.length || !raw.testCommand || !raw.language) throw new Error("Incomplete plan from model");
      if (!["python", "node", "java"].includes(raw.language)) throw new Error(`Unsupported language ${raw.language}`);
      const plan: ProjectPlan = {
        name: (raw.name ?? "aetheris-task").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "aetheris-task",
        language: raw.language as Language,
        summary: raw.summary ?? "",
        testCommand: raw.testCommand,
        files: raw.files.map((f) => ({ path: sanitizePath(f.path), content: String(f.content ?? "") })),
      };
      return { plan, provider: r.provider, model: r.model };
    } catch (e) {
      lastErr = e;
      messages.push({ role: "assistant", content: r.content });
      messages.push({ role: "user", content: `That was not valid: ${(e as Error).message}. Return ONLY the JSON object.` });
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Code generation failed");
}

export async function summarizeRun(input: {
  task: string;
  plan: ProjectPlan;
  conclusion: string;
  log: string;
  preferred?: string;
}): Promise<string> {
  const trimmed = input.log.length > 12_000 ? `…(truncated)…\n${input.log.slice(-12_000)}` : input.log;
  const r = await route({
    preferred: input.preferred,
    temperature: 0.3,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You are Aetheris One reporting the result of a cloud CI run to the user. Be concise (under 150 words). " +
          "State clearly whether tests passed. If they failed, quote the key error line(s) and suggest the fix. Use Markdown.",
      },
      {
        role: "user",
        content: `Task: ${input.task}\nProject: ${input.plan.name} (${input.plan.language}) — ${input.plan.summary}\nCI conclusion: ${input.conclusion}\n\nCI log:\n${trimmed}`,
      },
    ],
  });
  return r.content;
}
