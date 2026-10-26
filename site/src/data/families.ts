// Which unlock mechanism a card belongs to, and which measured card can stand as its
// reference. Derived from the chip prefix already in devices.ts, never from a guess.
//
// The point of this module is honesty about coverage: a reader landing on an untested
// card deserves to know whether the same module was measured on a sibling, or whether
// nobody in this project has measured that generation at all. Those are different
// answers and the page must not blur them.

import { BENCH_RUNS } from "./benchmarks.ts";

export type Family = "Ada" | "Ampere" | "Turing";

/** AD102/AD103 are Ada, GA10x is Ampere, TU10x is Turing. */
export function familyOf(chip: string): Family | null {
  if (chip.startsWith("AD")) return "Ada";
  if (chip.startsWith("GA")) return "Ampere";
  if (chip.startsWith("TU")) return "Turing";
  return null;
}

const MEASURED = new Set(BENCH_RUNS.map((r) => r.cardSlug));

/**
 * The measured card a reader can look at as a stand-in for this generation.
 * Ampere returns null on purpose: no Ampere board in this repo has a same-card
 * measurement, and inventing one would misrepresent the evidence.
 */
export function referenceCardFor(family: Family): string | null {
  const candidate = BENCH_RUNS.find((r) => familyOf(r.chip) === family && MEASURED.has(r.cardSlug));
  return candidate?.cardSlug ?? null;
}

/** How many boards this repo lists for a generation, measured or not. */
export function familyCoverage(devices: { chip: string; slug: string }[], family: Family) {
  const members = devices.filter((d) => familyOf(d.chip) === family);
  return {
    total: members.length,
    measured: members.filter((d) => MEASURED.has(d.slug)).length,
  };
}
