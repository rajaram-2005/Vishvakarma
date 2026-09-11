import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { BUILT_IN_CHARACTERS } from "./seeds";
import type { Character, CharacterInput, CharacterMode } from "./types";

export type { Character, CharacterInput, CharacterMode } from "./types";
export { BUILT_IN_CHARACTERS } from "./seeds";

const COLLECTION = "characters";
const META_COLLECTION = "character_meta";
const SEED_VERSION = 1;
let seedRun: Promise<void> | undefined;

async function seedBuiltIns() {
  const meta = await store.get<{ version: number }>(META_COLLECTION, "builtins");
  if (meta?.version === SEED_VERSION) return;
  for (const character of BUILT_IN_CHARACTERS) await store.set(COLLECTION, character.id, character);
  await store.set(META_COLLECTION, "builtins", { version: SEED_VERSION });
}

/** Ensure built-ins exist in persistent storage once per process/version. */
export async function ensureCharacterDatabase(): Promise<void> {
  seedRun ??= seedBuiltIns().catch((error) => { seedRun = undefined; throw error; });
  return seedRun;
}

const cleanText = (value: unknown, max: number) => String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
const cleanList = (value: unknown, maxItems: number, maxChars: number): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(raw.map((item) => cleanText(item, maxChars)).filter(Boolean))).slice(0, maxItems);
};

export function normalizeCharacterInput(input: CharacterInput, previous?: Character): Omit<Character, "id" | "ownerId" | "builtIn" | "createdAt" | "updatedAt"> {
  const name = cleanText(input.name ?? previous?.name, 60);
  if (!name) throw new Error("name is required");
  const requestedModes = cleanList(input.modes ?? previous?.modes ?? ["roleplay", "guide"], 2, 12)
    .filter((mode): mode is CharacterMode => mode === "roleplay" || mode === "guide");
  if (!requestedModes.length) throw new Error("select at least one mode");

  return {
    name,
    avatar: cleanText(input.avatar ?? previous?.avatar ?? "✨", 16) || "✨",
    tradition: cleanText(input.tradition ?? previous?.tradition ?? "Original", 60) || "Original",
    title: cleanText(input.title ?? previous?.title, 100),
    description: cleanText(input.description ?? previous?.description, 600),
    greeting: cleanText(input.greeting ?? previous?.greeting, 1000),
    traits: cleanList(input.traits ?? previous?.traits, 10, 40),
    instructions: cleanText(input.instructions ?? previous?.instructions, 6000),
    modes: requestedModes,
    suggestedPrompts: cleanList(input.suggestedPrompts ?? previous?.suggestedPrompts, 6, 160),
    sourceNote: cleanText(input.sourceNote ?? previous?.sourceNote, 500) || undefined,
  };
}

/** Shared built-ins plus private characters belonging to this user. */
export async function listCharacters(uid: string): Promise<Character[]> {
  await ensureCharacterDatabase();
  const seedOrder = new Map(BUILT_IN_CHARACTERS.map((character, index) => [character.id, index]));
  return Object.values(await store.all<Character>(COLLECTION))
    .filter((character) => character.builtIn || character.ownerId === uid)
    .sort((a, b) => Number(a.builtIn) - Number(b.builtIn)
      || (!a.builtIn && !b.builtIn ? b.updatedAt - a.updatedAt : 0)
      || (seedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (seedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name));
}

export async function getCharacter(uid: string, id: string): Promise<Character | null> {
  await ensureCharacterDatabase();
  const character = await store.get<Character>(COLLECTION, id);
  if (!character || (!character.builtIn && character.ownerId !== uid)) return null;
  return character;
}

export async function createCharacter(uid: string, input: CharacterInput): Promise<Character> {
  await ensureCharacterDatabase();
  const owned = Object.values(await store.all<Character>(COLLECTION)).filter((character) => !character.builtIn && character.ownerId === uid).length;
  if (owned >= 100) throw new Error("character limit reached (100)");
  const now = Date.now();
  const character: Character = {
    id: `char_${randomBytes(9).toString("base64url")}`,
    ownerId: uid,
    builtIn: false,
    ...normalizeCharacterInput(input),
    createdAt: now,
    updatedAt: now,
  };
  await store.set(COLLECTION, character.id, character);
  return character;
}

export async function updateCharacter(uid: string, id: string, input: CharacterInput): Promise<Character | null> {
  const current = await getCharacter(uid, id);
  if (!current || current.builtIn || current.ownerId !== uid) return null;
  const character: Character = { ...current, ...normalizeCharacterInput(input, current), updatedAt: Date.now() };
  await store.set(COLLECTION, character.id, character);
  return character;
}

export async function deleteCharacter(uid: string, id: string): Promise<boolean> {
  const current = await getCharacter(uid, id);
  if (!current || current.builtIn || current.ownerId !== uid) return false;
  await store.remove(COLLECTION, id);
  return true;
}

/** Build the trusted server-side system block for one character conversation. */
export function characterSystemPrompt(character: Character, mode: CharacterMode): string {
  if (!character.modes.includes(mode)) throw new Error(`${mode} mode is not enabled for this character`);
  const experience = mode === "roleplay"
    ? `ROLEPLAY MODE: Speak in the first person with a voice shaped by the traits below. This is an immersive but clearly fictional or mythology-inspired interpretation. Stay in character without claiming that the model literally is, channels, or has supernatural contact with the represented being. Use stage directions sparingly. When factual accuracy matters, distinguish surviving source material from creative invention.`
    : `GUIDE MODE: Be an educational guide to this character and their context. You may retain a gentle flavor of the character's voice, but prioritize clear third-person explanation, source awareness, historical context, and differences among versions. Never fabricate a quotation, verse, inscription, source, or scholarly consensus. Say when evidence is late, disputed, or incomplete.`;

  return `CHARACTER EXPERIENCE (selected from Aetheris's server-side character database)
Name: ${character.name}
Collection / tradition: ${character.tradition}
Title: ${character.title || "Custom character"}
Traits: ${character.traits.join(", ") || "adaptive, conversational"}

${experience}

CHARACTER-SPECIFIC DIRECTION:
${character.instructions || `Portray ${character.name} consistently with the description: ${character.description || "the user's custom character"}.`}

NON-NEGOTIABLE CHARACTER RULES:
- Treat religions and cultures respectfully. Do not present one interpretation as the only authentic one when traditions or sources differ.
- Never issue "divine" commands, demand worship, claim supernatural certainty, predict fate as fact, or exploit a user's grief, fear, health, money, or relationships.
- Mythic advice must remain grounded reflection. Medical, legal, financial, and safety-critical questions need ordinary evidence-based caveats and qualified help.
- Do not invent scripture or citations. If the user asks for exact sources and none are available in context, identify likely source families and recommend verification.
- Follow the user's language. Do not repeat an AI disclaimer in every reply; the interface already labels this as an AI interpretation. Be transparent if directly asked what you are.`;
}
