/**
 * validate-persons.ts
 *
 * Cross-checks Wikipedia person matches against seed data year ranges
 * using Wikidata birth/death dates. Flags mismatches where the matched
 * Wikipedia article is likely the wrong person (e.g., a modern DJ instead
 * of a historical scientist).
 *
 * Checks:
 *   1. URL patterns — catches non-person pages (craters, theorems, laws)
 *   2. Wikidata lifespan — fetches birth/death years from Wikidata and
 *      compares against the technology year range from seed data
 *
 * Usage:
 *   npx tsx scripts/validate-persons.ts              # full validation
 *   npx tsx scripts/validate-persons.ts --fix        # remove flagged entries from cache
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── Config ──────────────────────────────────────────────────────────────

const SEED_PATH = resolve("data", "seed_data.json");
const CACHE_PATH = resolve("data", "persons_wiki.json");
const RATE_LIMIT_MS = 100;
const WIKIDATA_BATCH_SIZE = 50;
const USER_AGENT =
  "TechRelative/1.0 (https://github.com/techrelative; educational project; person validation)";

// How many years of tolerance to allow between a person's lifespan and
// the technology years they're associated with. Generous to account for
// posthumous publications, delayed recognition, etc.
const YEAR_TOLERANCE = 80;

// Modern researchers correctly attributed to ancient technologies.
// These are not wrong matches — the person studied/discovered the technology,
// they didn't invent it contemporaneously.
// Currently empty — Wrangham/Frere removed from seed data instead.
const ALLOWLIST = new Set<string>([]);

// ── Types ───────────────────────────────────────────────────────────────

interface SeedTechnology {
  name: string;
  year: number;
  person: string | null;
  category: string;
}

interface PersonCache {
  name: string;
  wikipediaUrl: string | null;
  thumbnailUrl: string | null;
  wikidataId: string | null;
  status: "found" | "not_found" | "error";
}

type CacheMap = Record<string, PersonCache>;

interface Flagged {
  name: string;
  reason: string;
  seedYears: { min: number; max: number };
  wikiUrl: string | null;
  wikidataId: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** URL patterns that indicate the Wikipedia article is not about a person. */
const NON_PERSON_URL_RE =
  /\(crater\)|\(disambiguation\)|'s_problem|_theorem|_equation|_conjecture|_number(?!\w)|_constant|_law(?!\w)|_effect(?!\w)|_principle|_paradox|_algorithm|\(politician\)/i;

// ── Wikidata lifespan fetching ──────────────────────────────────────────

interface Lifespan {
  birthYear: number | null;
  deathYear: number | null;
}

/**
 * Fetch birth/death years from Wikidata for a batch of entity IDs.
 * Uses the wbgetentities API with props=claims, extracting P569 (birth)
 * and P570 (death) date claims.
 */
async function batchFetchLifespans(
  wikidataIds: string[]
): Promise<Map<string, Lifespan>> {
  const result = new Map<string, Lifespan>();

  const ids = wikidataIds.join("|");
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities` +
    `&ids=${ids}&props=claims&format=json`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    console.error(`  Wikidata API error: HTTP ${res.status}`);
    return result;
  }

  const data = await res.json();
  const entities = data.entities || {};

  for (const [id, entity] of Object.entries(entities) as [string, any][]) {
    if (entity.missing !== undefined) continue;

    const claims = entity.claims || {};
    const birthYear = extractYear(claims.P569);
    const deathYear = extractYear(claims.P570);

    result.set(id, { birthYear, deathYear });
  }

  return result;
}

/** Extract a year from a Wikidata date claim (P569/P570). */
function extractYear(claim: any[] | undefined): number | null {
  if (!claim || claim.length === 0) return null;
  const value = claim[0]?.mainsnak?.datavalue?.value;
  if (!value?.time) return null;

  // Wikidata time format: "+1643-01-04T00:00:00Z" or "-0300-01-01T00:00:00Z"
  const match = value.time.match(/^([+-]\d+)-/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Check if a person's lifespan is plausible for the technology years
 * they're associated with.
 */
function isLifespanPlausible(
  lifespan: Lifespan,
  seedMin: number,
  seedMax: number
): { plausible: boolean; reason: string } {
  const { birthYear, deathYear } = lifespan;

  // No dates available — can't validate
  if (birthYear === null && deathYear === null) {
    return { plausible: true, reason: "no_dates" };
  }

  // Person was born well after the technology period
  if (birthYear !== null && birthYear > seedMax + YEAR_TOLERANCE) {
    return {
      plausible: false,
      reason: `born ${birthYear}, but tech years are ${seedMin}–${seedMax}`,
    };
  }

  // Person died well before the technology period
  if (deathYear !== null && deathYear < seedMin - YEAR_TOLERANCE) {
    return {
      plausible: false,
      reason: `died ${deathYear}, but tech years are ${seedMin}–${seedMax}`,
    };
  }

  return { plausible: true, reason: "ok" };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");

  // Load data
  console.log("Loading seed data and cache...");
  const seedData = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  if (!existsSync(CACHE_PATH)) {
    console.error("No persons_wiki.json cache found. Run enrich-persons first.");
    process.exit(1);
  }
  const cache: CacheMap = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));

  // Build year ranges per person from seed data
  const personYears = new Map<string, { min: number; max: number }>();
  for (const t of seedData.technologies as SeedTechnology[]) {
    if (!t.person) continue;
    const names = t.person.includes(",")
      ? t.person.split(",").map((n: string) => n.trim()).filter(Boolean)
      : [t.person];
    for (const name of names) {
      const existing = personYears.get(name);
      if (existing) {
        existing.min = Math.min(existing.min, t.year);
        existing.max = Math.max(existing.max, t.year);
      } else {
        personYears.set(name, { min: t.year, max: t.year });
      }
    }
  }

  const found = Object.entries(cache).filter(
    ([name, entry]) =>
      entry.status === "found" && personYears.has(name) && !ALLOWLIST.has(name)
  );
  console.log(`Found persons to validate: ${found.length}\n`);

  const flagged: Flagged[] = [];

  // ── Check 1: Non-person URL patterns ──
  console.log("Check 1: URL patterns...");
  for (const [name, entry] of found) {
    const url = entry.wikipediaUrl || "";
    if (NON_PERSON_URL_RE.test(url)) {
      flagged.push({
        name,
        reason: `URL looks like non-person article: ${url}`,
        seedYears: personYears.get(name)!,
        wikiUrl: entry.wikipediaUrl,
        wikidataId: entry.wikidataId,
      });
    }
  }
  console.log(`  Flagged by URL: ${flagged.length}`);

  // ── Check 2: Wikidata lifespan validation ──
  const withWikidata = found.filter(
    ([, entry]) => entry.wikidataId && !flagged.some((f) => f.name === entry.name)
  );
  console.log(`\nCheck 2: Wikidata lifespan validation (${withWikidata.length} persons)...`);

  const lifespanFlagged: Flagged[] = [];

  for (let i = 0; i < withWikidata.length; i += WIKIDATA_BATCH_SIZE) {
    const batch = withWikidata.slice(i, i + WIKIDATA_BATCH_SIZE);
    const ids = batch.map(([, entry]) => entry.wikidataId!);

    const lifespans = await batchFetchLifespans(ids);

    for (const [name, entry] of batch) {
      const lifespan = lifespans.get(entry.wikidataId!);
      if (!lifespan) continue;

      const years = personYears.get(name)!;
      const { plausible, reason } = isLifespanPlausible(lifespan, years.min, years.max);

      if (!plausible) {
        lifespanFlagged.push({
          name,
          reason,
          seedYears: years,
          wikiUrl: entry.wikipediaUrl,
          wikidataId: entry.wikidataId,
          birthYear: lifespan.birthYear,
          deathYear: lifespan.deathYear,
        });
      }
    }

    if (i + WIKIDATA_BATCH_SIZE < withWikidata.length) {
      await sleep(RATE_LIMIT_MS);
    }

    const progress = Math.min(i + WIKIDATA_BATCH_SIZE, withWikidata.length);
    process.stdout.write(`  Checked ${progress}/${withWikidata.length}\r`);
  }

  console.log(`\n  Flagged by lifespan: ${lifespanFlagged.length}`);
  flagged.push(...lifespanFlagged);

  // ── Report ──
  console.log("\n" + "═".repeat(60));
  console.log(" Person Validation Report");
  console.log("═".repeat(60));

  if (flagged.length === 0) {
    console.log("\nAll persons validated successfully.");
    return;
  }

  console.log(`\nFlagged: ${flagged.length} persons\n`);
  flagged.sort((a, b) => a.seedYears.min - b.seedYears.min);

  for (const f of flagged) {
    console.log(`  ${f.name}`);
    console.log(`    Reason: ${f.reason}`);
    if (f.birthYear !== undefined || f.deathYear !== undefined) {
      console.log(
        `    Wikidata lifespan: ${f.birthYear ?? "?"} – ${f.deathYear ?? "?"}`
      );
    }
    console.log(`    URL: ${f.wikiUrl}`);
    console.log();
  }

  // ── Fix mode: remove flagged from cache ──
  if (fix) {
    let removed = 0;
    for (const f of flagged) {
      if (cache[f.name]) {
        cache[f.name] = {
          name: f.name,
          wikipediaUrl: null,
          thumbnailUrl: null,
          wikidataId: null,
          status: "not_found",
        };
        removed++;
      }
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log(`Removed ${removed} flagged entries from cache.`);
    console.log("Run enrich-persons --db-only to update the database.");
  } else {
    console.log("Run with --fix to remove flagged entries from cache.");
  }
}

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
