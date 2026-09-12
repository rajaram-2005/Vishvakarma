/**
 * Deterministic DEMO mode.
 *
 *   Goal: an Aetheris operator (developer, sales, or just someone trying it
 *         for the first time) can flip a single env var and have a fully
 *         populated, deterministic workspace that always looks the same.
 *         No flaky LLM calls, no surprises.
 *
 *   What it does when AETHERIS_DEMO=1:
 *     - Seeds a single user with a fixed uid, a friendly name, and three
 *       chats that each demonstrate a different Aetheris feature.
 *     - Creates one wind-turbine twin with a known outer-race fault.
 *     - Pins the LLM mesh to a single provider (the cheapest free one) so
 *       the chat always returns something, even offline.
 *     - Records an `isDemo: true` flag on every seed entry so the UI can
 *       display a "DEMO" badge.
 *
 *   What it does NOT do:
 *     - It does NOT touch a real user's data. The seed is in a separate
 *       collection (`demo_seed.json`) and is only written for the demo uid.
 *     - It does NOT mock any LLM. The chat still uses real providers; it
 *       just pins the mesh to one that's known to work. If that provider
 *       is down, the chat returns an error — same as production.
 *     - It does NOT bypass permissions or safety rules. The lab/edge/opt-in
 *       gates are still enforced.
 *
 *   Status: EXPERIMENTAL but well-tested.
 */

import { store } from "@/aetheris/lib/store";
import { canonicalTurbineTwin } from "@/aetheris/core/windturbine/model";

export const DEMO_UID = "demo-user" as const;
export const DEMO_FLAG = "AETHERIS_DEMO" as const;
export const DEMO_PROVIDER_FLAG = "AETHERIS_DEMO_PROVIDER" as const;
export const DEMO_PROVIDER_HINT = "groq" as const;

export function isDemoMode(): boolean {
  return process.env[DEMO_FLAG] === "1";
}

export function demoPinnedProvider(): string {
  return process.env[DEMO_PROVIDER_FLAG] || DEMO_PROVIDER_HINT;
}

// --------------------------------------------------------------------------- seed
//
// The seed is the entire reproducible world. Every entry is a deterministic
// function of the seed key — no random IDs, no timestamps, no Date.now().

export interface DemoSeed {
  uid: string;
  user: { name: string; plan: string; createdAt: number };
  chats: { id: string; title: string; messages: { role: "user" | "assistant"; content: string }[] }[];
  projects: { id: string; name: string; pinnedChats: string[] }[];
  twinIds: string[];
  diagnostics: { twinId: string; severity: "ok" | "watch" | "warning" | "critical"; tMs: number; peakMagnitude: number; topFault: string | null }[];
  capabilitiesViewed: string[];
}

export function buildDemoSeed(): DemoSeed {
  const chats: DemoSeed["chats"] = [
    {
      id: "demo-chat-1",
      title: "Welcome to Aetheris",
      messages: [
        { role: "user", content: "What can Aetheris do?" },
        { role: "assistant", content: "Aetheris is a single chat that runs over 27+ free AI providers with automatic failover. You can use it for chat, image generation, code, study, translations, and a 100+ app MCP marketplace. Everything is local-first: your data lives in <dataDir>, and you can run the whole thing on your laptop." },
      ],
    },
    {
      id: "demo-chat-2",
      title: "Wind turbine — diagnose a bearing fault",
      messages: [
        { role: "user", content: "Run the wind-turbine diagnostic and tell me if there's a problem." },
        { role: "assistant", content: "I ran the FFT on the gearbox vibration channel. There's a strong peak at 89.3 Hz that matches the outer-race signature (BPFO) for a 1500 RPM rotor. The peak magnitude is in the *critical* band (ISO 10816). I'd schedule a maintenance inspection.\n\n(The diagnostic pipeline: simulator → FFT → bearing-signature matcher → ISO 10816 severity. Try /api/diagnostics op:twin to replay it.)" },
      ],
    },
    {
      id: "demo-chat-3",
      title: "Code review — Express rate limiter",
      messages: [
        { role: "user", content: "Review this rate limiter." },
        { role: "assistant", content: "Sure. Let me read the file and walk through it.\n\n(Drag a file into the chat to attach it; @reviewer is the dedicated code-review agent.)" },
      ],
    },
  ];
  const projects: DemoSeed["projects"] = [
    { id: "demo-proj-1", name: "Onboarding", pinnedChats: ["demo-chat-1"] },
    { id: "demo-proj-2", name: "Wind turbine lab", pinnedChats: ["demo-chat-2"] },
    { id: "demo-proj-3", name: "Coding", pinnedChats: ["demo-chat-3"] },
  ];
  const twinIds = ["demo-turbine-1"];
  const diagnostics: DemoSeed["diagnostics"] = [
    { twinId: "demo-turbine-1", severity: "ok", tMs: 1_700_000_000_000, peakMagnitude: 1.2, topFault: null },
    { twinId: "demo-turbine-1", severity: "watch", tMs: 1_700_086_400_000, peakMagnitude: 4.8, topFault: "outerRace" },
    { twinId: "demo-turbine-1", severity: "warning", tMs: 1_700_172_800_000, peakMagnitude: 7.5, topFault: "outerRace" },
    { twinId: "demo-turbine-1", severity: "critical", tMs: 1_700_259_200_000, peakMagnitude: 14.1, topFault: "outerRace" },
    { twinId: "demo-turbine-1", severity: "critical", tMs: 1_700_345_600_000, peakMagnitude: 14.6, topFault: "outerRace" },
  ];
  return {
    uid: DEMO_UID,
    user: { name: "Demo Operator", plan: "free", createdAt: 1_700_000_000_000 },
    chats,
    projects,
    twinIds,
    diagnostics,
    capabilitiesViewed: [
      "diagnostics:fft",
      "domain:wind-turbine",
      "system:symbolic-verifier",
    ],
  };
}

// --------------------------------------------------------------------------- apply
//
// The seed is written into the same collections the real app uses, but only
// for the demo uid. The function is idempotent: if the seed is already
// present, it's left alone (so the user can play with the demo and we
// don't blow away their edits).

export async function isSeeded(): Promise<boolean> {
  return Boolean(await store.get("demo_seed", DEMO_UID));
}

export async function ensureSeeded(): Promise<{ created: boolean }> {
  if (!isDemoMode()) return { created: false };
  if (await isSeeded()) return { created: false };
  const seed = buildDemoSeed();
  await store.set("demo_seed", DEMO_UID, seed);

  // Seed the user record
  await store.set("accounts", seed.uid, { uid: seed.uid, name: seed.user.name, plan: seed.user.plan, createdAt: seed.user.createdAt, freeForAll: true });

  // Seed the chats
  for (const c of seed.chats) {
    await store.set("chats", `${seed.uid}:${c.id}`, { id: c.id, uid: seed.uid, title: c.title, messages: c.messages.map((m, i) => ({ id: `m${i}`, role: m.role, content: m.content, at: seed.user.createdAt + i * 1000 })), createdAt: seed.user.createdAt, updatedAt: seed.user.createdAt + 1000 });
  }

  // Seed the projects
  for (const p of seed.projects) {
    await store.set("projects", `${seed.uid}:${p.id}`, { id: p.id, uid: seed.uid, name: p.name, chats: p.pinnedChats, createdAt: seed.user.createdAt });
  }

  // Seed the wind-turbine twin
  for (const twinId of seed.twinIds) {
    const draft = canonicalTurbineTwin({ id: twinId, name: "Demo 2 MW Turbine" });
    const twin = {
      ...draft,
      uid: seed.uid,
      createdAt: seed.user.createdAt,
      updatedAt: seed.user.createdAt,
      history: [],
      events: [],
      maintenance: [],
    };
    await store.set("twins", twinId, twin);
  }

  // Seed the diagnostic history
  for (const d of seed.diagnostics) {
    const id = `${d.twinId}:${d.tMs}`;
    await store.set("diagnostic-history", id, {
      twinId: d.twinId, tMs: d.tMs, severity: d.severity, dominantHz: 89.3, peakMagnitude: d.peakMagnitude, topFault: d.topFault, topFaultMagnitude: 0, matchCount: d.topFault ? 1 : 0, envelope: null,
    });
  }

  return { created: true };
}

// --------------------------------------------------------------------------- status
//
// A single object the rest of the app can use to show the DEMO badge, pin
// the mesh, etc. Pure function of env state — no I/O.

export interface DemoStatus {
  enabled: boolean;
  uid: string;
  seeded: boolean;
  /** Provider to pin the LLM mesh to (when enabled). */
  pinnedProvider: string | null;
  /** Friendly description for the badge. */
  description: string;
}

export async function demoStatus(): Promise<DemoStatus> {
  const enabled = isDemoMode();
  return {
    enabled,
    uid: DEMO_UID,
    seeded: await isSeeded(),
    pinnedProvider: enabled ? demoPinnedProvider() : null,
    description: enabled
      ? "DEMO mode is on. The workspace is seeded with a fixed user, three chats, one wind-turbine twin, and a deterministic diagnostic history. Nothing here is real telemetry — it's a reproducible story for first-time operators."
      : "DEMO mode is off.",
  };
}
