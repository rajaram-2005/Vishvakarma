/** Meta-learning memory: per-user lessons extracted by Metis after each orchestrated run. */
import { store } from "@/aetheris/lib/store";
import type { Lesson } from "./types";

const COLL = "lessons";
const MAX = 60;

export async function getLessons(uid: string): Promise<Lesson[]> {
  return (await store.get<Lesson[]>(COLL, uid)) ?? [];
}

export async function addLessons(uid: string, lessons: Lesson[]): Promise<Lesson[]> {
  if (lessons.length === 0) return getLessons(uid);
  return store.update<Lesson[]>(COLL, uid, (cur) => {
    const all = [...(cur ?? [])];
    for (const l of lessons) {
      const t = l.text.trim();
      if (!t || all.some((x) => x.text.toLowerCase() === t.toLowerCase())) continue;
      all.push({ ...l, text: t.slice(0, 160) });
    }
    return all.slice(-MAX);
  });
}

export async function forgetLesson(uid: string, text: string): Promise<Lesson[]> {
  return store.update<Lesson[]>(COLL, uid, (cur) => (cur ?? []).filter((l) => l.text !== text));
}

export async function clearLessons(uid: string): Promise<void> {
  await store.remove(COLL, uid);
}

export function lessonsBlock(lessons: Lesson[], agent?: string): string {
  const rel = lessons.filter((l) => !agent || l.agent === agent || l.agent === "*").slice(-15);
  if (rel.length === 0) return "";
  return `LESSONS LEARNED (from Metis, apply silently):\n${rel.map((l) => `- ${l.text}`).join("\n")}`;
}
