/** Shared voice-mode helpers (server-safe). */
const NAMES: Record<string, string> = { en: "English", ta: "Tamil", hi: "Hindi", te: "Telugu", kn: "Kannada", ml: "Malayalam", bn: "Bengali", mr: "Marathi", gu: "Gujarati", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", ja: "Japanese", ar: "Arabic" };
export function languageName(tag: string): string { return NAMES[tag.toLowerCase().split("-")[0]] ?? tag; }

/** System-prompt block appended when the user is talking by voice and the reply will be read aloud. */
export function voicePrompt(tag: string): string {
  const name = languageName(tag);
  return `VOICE MODE — the user spoke this message and your reply will be READ ALOUD by text-to-speech.
- Reply in ${name} unless the user clearly spoke another language; match their language.
- Be conversational and brief: 1–4 short sentences for simple questions, at most ~120 words otherwise. Lead with the answer.
- No markdown, headings, bullet lists, tables, emojis or URLs. Spell out symbols and units ("5 per cent", "square metres"). Keep numbers short.
- Only if code or a table is truly needed, say one sentence first, then put the code/table in a fenced block (it is shown on screen, not spoken).
- Transcription may contain mistakes; infer the likely intent and, if genuinely ambiguous, ask one short question.`;
}
