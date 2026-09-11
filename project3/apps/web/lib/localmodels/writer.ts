/**
 * Aetherion Writer — an own, offline creative model.
 * Seeded template storytelling + haiku, fully deterministic: the same
 * prompt always produces the same piece.
 */

// FNV-1a hash → deterministic PRNG
function seedFrom(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length) % arr.length]; }

type Genre = { keys: RegExp; title: string[]; hero: string[]; place: string[]; opening: string[]; middle: string[]; ending: string[] };

const GENRES: Genre[] = [
  {
    keys: /space|star|galaxy|planet|astronaut|sci-?fi|future/i,
    title: ['Signal from the Dark', 'The Last Relay', 'Orbitfall', 'The Quiet Between Stars'],
    hero: ['Mara Voss', 'Commander Idris', 'Dr. Lena Okafor', 'Pilot Ash Ren'],
    place: ['the derelict station Kessler-9', 'a moon base that should be empty', 'the edge of the heliopause'],
    opening: ['The airlock cycled open onto silence — not the mechanical silence of vacuum, but the silence of something choosing not to speak.', 'Her helmet display flickered once, then painted the horizon with a signal that had no right to exist.', 'They had been told the colony was thriving. The colony was not thriving.'],
    middle: ['What followed was the oldest human ritual: inventory, repair, and the slow acceptance that the map was wrong.', 'Three days of rationed oxygen taught them more about each other than three years of mission logs ever had.', 'The signal repeated every 47 minutes, always closer, never on any sensor but the one they could not explain.'],
    ending: ['When the rescue beacon finally answered, they hesitated before replying. Some discoveries are only safe if they remain yours.', 'They left the station dark behind them — but on every screen, for one frame, the signal winked goodbye.', 'No one believed the log. Which, the narrator notes, is exactly why they are still alive.'],
  },
  {
    keys: /magic|dragon|kingdom|wizard|fantasy|sword|quest|crown|elf/i,
    title: ['The Cartographer of Whispering Roads', 'A Crown of Embers', 'The Gate That Leans', 'Salt and Scepter'],
    hero: ['Wren the Unlicensed Cartographer', 'Sir Aldric of the Hollow Hill', 'the apprentice who read the wrong ledger'],
    place: ['the moss-eaten city of Verdemont', 'a crossroads that only appears at dusk', 'the library beneath the library'],
    opening: ['Every mapmaker in Verdemont knew rule one: never draw the roads you hear singing.', 'The crown was heavy, yes — but it was the warmth of it, the way it purred against her skull, that worried Sir Aldric.', 'The gate had stood leaning for three hundred years. On the fourth day of spring, it leaned back.'],
    middle: ['The road had opinions. It disliked shortcuts, mistrusted bridges, and seemed personally offended by the compass.', 'What the ledger recorded was a debt. What the ledger owed was considerably more complicated.', 'They traveled by rumor, which is to say they traveled faster than the truth but never arrived before it.'],
    ending: ['And so the kingdom kept its gate, and the gate kept its promise — which was, as all the best promises are, slightly larger than expected.', 'The last page of the map was blank. Wren smiled. That was the point.', 'The embers would not go out. Some coronations, they say, are simply agreements with fire.'],
  },
  {
    keys: /noir|detective|murder|mystery|crime|city night|investigat/i,
    title: ['Neon Alibi', 'The Case of the Unlocked Room', 'Rain on Glass', 'Midnight Protocol'],
    hero: ['Detective June Marlow', 'the private eye who owed everyone', 'a records clerk with a photographic memory for lies'],
    place: ['a city that glowed like a fever', 'the 14th floor, which the building did not officially have', 'a diner where the coffee tasted like confession'],
    opening: ['The city owed her a case that made sense. The city, as usual, paid in the opposite currency.', 'It was 2:47 a.m. and the rain was writing letters on the window that she did not want to read.', 'The room was locked from the inside. The body was not inside. That was the first problem.'],
    middle: ['Every witness told the truth. That was the problem — their truths did not share a city.', 'He followed the money the way other men follow jazz: expecting nothing, catching everything.', 'The photograph showed a man leaving the building. The man in the photograph was still in the building.'],
    ending: ['The case closed the way doors close in that city — softly, then all at once, then never quite all the way.', 'She filed it under “unexplained.” The file, notably, was the thickest in the drawer.', 'Justice, in the end, was a receipt she could not cash. She kept it anyway.'],
  },
];

function story(text: string): string {
  const seed = seedFrom(text);
  const r = rng(seed);
  const lower = text.toLowerCase();
  const genre = GENRES.find((g) => g.keys.test(lower)) ?? GENRES[seed % GENRES.length];
  const hero = pick(r, genre.hero);
  const place = pick(r, genre.place);
  return [
    `**${pick(r, genre.title)}**`,
    `*A short piece by Aetherion Writer — seeded from your prompt (deterministic: the same prompt always returns this story).*`,
    '',
    pick(r, genre.opening),
    '',
    `${hero} had come to ${place} for reasons that were, at best, well-intentioned. ${pick(r, genre.middle)}`,
    '',
    pick(r, genre.ending),
  ].join('\n');
}

const HAIKU = [
  { l1: 'first light on the lake', l2: 'a slow wind moves through the pines', l3: 'and the world is still' },
  { l1: 'cold rain on the roof', l2: 'shadows lengthen on the hills', l3: 'nothing else remains' },
  { l1: 'the old crow takes flight', l2: 'the pale moon holds the harbor', l3: 'a window opens' },
  { l1: 'morning mist rises', l2: 'dragonflies trace the water', l3: 'the temple bell rings' },
  { l1: 'deep lake mirrors sky', l2: 'a heron folds into silence', l3: 'reeds lean toward home' },
  { l1: 'autumn leaves let go', l2: 'the orchard hums with amber light', l3: 'winter knocks softly' },
  { l1: 'a lantern at dusk', l2: 'footsteps fade on the stone path', l3: 'stars arrive on time' },
  { l1: 'snow settles the town', l2: 'each rooftop keeps a quiet note', l3: 'smoke rises in thanks' },
];

function haiku(text: string): string {
  const seed = seedFrom(text);
  const r = rng(seed);
  const h = HAIKU[Math.floor(r() * HAIKU.length) % HAIKU.length];
  return [
    '**Haiku** — Aetherion Writer (5-7-5, deterministic)',
    '',
    h.l1 + ',',
    h.l2 + ',',
    h.l3 + '.',
  ].join('\n');
}

/** The writer model's entry point. */
export function writerAnswer(prompt: string): string {
  if (/haiku|poem|verse/.test(prompt.toLowerCase())) return haiku(prompt);
  if (/story|tale|write|narrat|fable/.test(prompt.toLowerCase())) return story(prompt);
  return '';
}
