import { NextResponse } from "next/server";
import { route } from "@/aetheris/lib/router/router";

export const runtime = "nodejs";

/**
 * Memory extraction: given the latest exchange and the current memory list, return new durable
 * facts about the user worth remembering across chats (or an empty list). Client stores them.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { user?: string; assistant?: string; memory?: string[] };
  const user = (body.user ?? "").slice(0, 4000);
  if (!user) return NextResponse.json({ facts: [] });
  const memory = (body.memory ?? []).slice(0, 60);
  try {
    const r = await route({
      temperature: 0, maxTokens: 200,
      messages: [
        { role: "system", content: "You maintain a long-term memory about the user for an AI assistant. Reply ONLY with a JSON array of short, third-person facts (max 3) that are durable and useful later: preferences, profile, projects, constraints, explicit 'remember this' requests. Ignore transient task details. Return [] if nothing qualifies or it is already known." },
        { role: "user", content: `Known memory:\n${memory.map((m) => `- ${m}`).join("\n") || "(empty)"}\n\nUser said:\n${user}\n\nAssistant replied (for context):\n${(body.assistant ?? "").slice(0, 1500)}` },
      ],
    });
    const m = /\[[\s\S]*\]/.exec(r.content);
    const facts = m ? (JSON.parse(m[0]) as unknown[]).map(String).map((s) => s.trim()).filter((s) => s.length > 3 && s.length < 200 && !memory.includes(s)).slice(0, 3) : [];
    return NextResponse.json({ facts });
  } catch {
    return NextResponse.json({ facts: [] });
  }
}
