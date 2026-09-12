import type { GalleryItem } from "@/app/api/gallery/route";
import type { SeedTuple } from "./seeds/types";
import { education } from "./seeds/education";
import { coding } from "./seeds/coding";
import { business } from "./seeds/business";
import { marketing } from "./seeds/marketing";
import { writing } from "./seeds/writing";
import { life } from "./seeds/life";
import { finance } from "./seeds/finance";
import { legal } from "./seeds/legal";
import { health } from "./seeds/health";
import { science } from "./seeds/science";
import { design } from "./seeds/design";
import { career } from "./seeds/career";
import { language } from "./seeds/language";
import { productivity } from "./seeds/productivity";
import { creative } from "./seeds/creative";
import { data } from "./seeds/data";
import { engineering } from "./seeds/engineering";
import { students } from "./seeds/students";
import { speaking } from "./seeds/speaking";
import { arts } from "./seeds/arts";
import { industry } from "./seeds/industry";
import { world } from "./seeds/world";
import { gaming } from "./seeds/gaming";
import { social } from "./seeds/social";
import { safety } from "./seeds/safety";
import { ai } from "./seeds/ai";

const sys = { uid: "aetheris", name: "Aetheris" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

const usedIds = new Set<string>();
/** Stable, unique id per seed: slug of the title, with a numeric suffix if a slug repeats (e.g. non-Latin titles). */
function seedId(category: string, title: string, i: number): string {
  const base = `seed-${category}-${slug(title) || `item-${i + 1}`}`;
  let id = base; let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id); return id;
}

function expand(list: SeedTuple[], category: string): GalleryItem[] {
  return list.map(([title, description, prompt, agents, tags], i) => ({
    id: seedId(category, title, i),
    title, description, prompt, agents,
    tags: Array.from(new Set([category, ...tags])),
    author: sys, createdAt: 1_750_000_000_000 - i * 1000, uses: 0, likes: Math.max(0, 12 - i), likedBy: [],
  }));
}

/**
 * Starter gallery: hand-written, domain-organised prompt recipes so the page is never empty.
 * Placeholders use {{double braces}}; the composer leaves them for the user to fill in.
 */
export const SEED: GalleryItem[] = [
  ...expand(education, "education"),
  ...expand(coding, "coding"),
  ...expand(business, "business"),
  ...expand(marketing, "marketing"),
  ...expand(writing, "writing"),
  ...expand(life, "life"),
  ...expand(finance, "finance"),
  ...expand(legal, "legal"),
  ...expand(health, "health"),
  ...expand(science, "science"),
  ...expand(design, "design"),
  ...expand(career, "career"),
  ...expand(language, "language"),
  ...expand(productivity, "productivity"),
  ...expand(creative, "creative"),
  ...expand(data, "data"),
  ...expand(engineering, "engineering"),
  ...expand(students, "students"),
  ...expand(speaking, "presentation"),
  ...expand(arts, "arts"),
  ...expand(industry, "industry"),
  ...expand(world, "world"),
  ...expand(gaming, "gaming"),
  ...expand(social, "social"),
  ...expand(safety, "safety"),
  ...expand(ai, "ai"),
];
