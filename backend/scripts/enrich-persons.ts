/**
 * enrich-persons.ts
 *
 * Fetches Wikipedia URL + thumbnail for each unique person in seed_data.json.
 *
 * Strategy (optimized per Wikimedia API docs):
 *   1. Search each person name individually (generator=search, 1 result)
 *   2. Collect matched titles into batches of 50
 *   3. Fetch pageimages + description + info for the whole batch in one call
 *      using titles=A|B|C (pipe-separated, as recommended by Wikimedia)
 *
 * This gives ~70 API calls per 3,377 persons instead of 3,377.
 * Respects Retry-After header on 429 responses.
 *
 * Results are cached in data/persons_wiki.json so re-runs skip resolved names.
 * Final step writes to MongoDB Person collection.
 *
 * Usage:
 *   npx tsx scripts/enrich-persons.ts              # full run
 *   npx tsx scripts/enrich-persons.ts --dry-run     # fetch only, no DB write
 *   npx tsx scripts/enrich-persons.ts --db-only     # skip fetching, write cached data to DB
 *   npx tsx scripts/enrich-persons.ts --retry-errors # re-fetch entries that previously errored
 *   npx tsx scripts/enrich-persons.ts --retry-notfound # re-fetch not_found entries
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Person } from "../src/models/Person.js";

dotenv.config();

// ── Config ──────────────────────────────────────────────────────────────

const SEED_PATH = resolve("data", "seed_data.json");
const CACHE_PATH = resolve("data", "persons_wiki.json");
const RATE_LIMIT_MS = 1000; // 1 req/sec baseline
const THUMBNAIL_SIZE = 200;
const USER_AGENT =
  "TechRelative/1.0 (https://github.com/techrelative; educational project; person enrichment)";
const MAX_RETRIES = 5;
const DEFAULT_RETRY_WAIT = 60_000; // fallback if no Retry-After header
const BATCH_SIZE = 50; // Wikipedia allows up to 50 titles per query

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

// ── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Rate limited");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

async function fetchJsonWithRetry(url: string): Promise<any> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (res.status === 429 || res.status === 503) {
      // Read Retry-After header (seconds) as recommended by Wikimedia docs
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000 + 1000 // +1s buffer
        : DEFAULT_RETRY_WAIT * attempt;
      console.log(
        `    ${res.status} rate limited, Retry-After: ${retryAfter || "none"}` +
        `, waiting ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt}/${MAX_RETRIES})...`
      );
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  throw new RateLimitError(DEFAULT_RETRY_WAIT);
}

// Whitelist: keywords that positively indicate a person article
const PERSON_PATTERNS = [
  /\bborn\b/i, /\bdied\b/i, /\(\d{3,4}[–\-]\d{3,4}\)/,
  // Science & engineering
  /\bphilosopher\b/i, /\binventor\b/i, /\bengineer/i,
  /\bscientist\b/i, /\bmathematician\b/i, /\bphysicist\b/i,
  /\bchemist\b/i, /\bastronomer\b/i, /\barchitect\b/i,
  /\bnaturalist\b/i, /\bbiologist\b/i, /\bpioneer\b/i,
  /\bbotanis/i, /\bzoolog/i, /\bgeolog/i, /\bmineralog/i,
  /\bmeteorolog/i, /\banthropolog/i, /\barchaeolog/i,
  // Medicine
  /\bphysician\b/i, /\bsurgeon\b/i, /\bdoctor\b/i, /\bapothecary/i,
  /\banatomist\b/i, /\bpatholog/i, /\bpharmac/i,
  // Arts & letters
  /\bwriter\b/i, /\bscholar\b/i, /\bauthor\b/i, /\bpoet\b/i,
  /\bartist\b/i, /\bpainter\b/i, /\bsculptor\b/i,
  /\bcomposer\b/i, /\bmusician\b/i, /\bphotograph/i, /\bfilmmaker\b/i,
  /\bhistorian\b/i, /\bgeographer\b/i, /\bcartographer\b/i,
  /\blexicograph/i, /\bphilolog/i, /\blinguist\b/i,
  /\bprofessor\b/i, /\bacademic\b/i, /\beducator\b/i,
  // Rulers & military
  /\bking\b/i, /\bqueen\b/i, /\bemperor/i, /\bempress/i,
  /\bpharaoh\b/i, /\bsultan\b/i, /\bcaliph\b/i, /\bpope\b/i,
  /\bgeneral\b/i, /\bcommander\b/i, /\badmiral\b/i, /\bmilitary\b/i,
  /\bstatesman\b/i, /\bpolitician\b/i, /\bdiplomat\b/i,
  // Nobility & clergy
  /\bnoble/i, /\bmarqui?s/i, /\bduke\b/i, /\bearl\b/i, /\bbaron/i,
  /\bpriest\b/i, /\bmonk\b/i, /\bbishop\b/i, /\bcardinal\b/i,
  /\bcleric\b/i, /\btheolog/i, /\bmystic\b/i, /\bprophet\b/i,
  // Commerce & industry
  /\bindustrialist\b/i, /\bentrepreneur\b/i, /\bbusinessman\b/i,
  /\bmerchan/i, /\bcraftsman\b/i, /\bartisan\b/i,
  /\bexplorer\b/i, /\bnavigatou?r\b/i, /\btravell?er\b/i,
  /\baviator\b/i, /\bpilot\b/i,
  // Social sciences
  /\bsociolog/i, /\beconomist\b/i, /\bpsycholog/i,
  // Computing
  /\bprogrammer\b/i, /\bcomputer\b/i,
  // Other
  /\balchemist\b/i, /\bastrologer\b/i, /\bherbal/i,
  /\bchancellor\b/i, /\bvizier\b/i, /\bgovernor\b/i, /\bviceroy\b/i,
  /\blandowner\b/i, /\bpatrician\b/i, /\btyrant\b/i,
  /\bcolonist\b/i, /\bmissionary\b/i, /\bfriar\b/i, /\babbot\b/i,
  /\bpolymath\b/i, /\bencycloped/i, /\bhumanist\b/i,
  /\bd\.\s?\d{3,4}/i, /\bb\.\s?\d{3,4}/i, /\bfl\.\s/i,
];

/**
 * Check if a Wikipedia description looks like it's about a person.
 */
function looksLikePerson(desc: string): boolean {
  if (!desc || desc.length < 3) return false;
  return PERSON_PATTERNS.some((p) => p.test(desc));
}

/**
 * Names that are generic attributions, not real people.
 * These waste API calls and produce wrong matches.
 */
function isGenericAttribution(name: string): boolean {
  const lower = name.toLowerCase();
  // Starts with generic prefixes
  if (/^(an?\s|the\s|unknown\s|anonymous|various|several)/i.test(lower)) return true;
  // Generic role descriptions without proper names
  if (/^(arab|chinese|greek|roman|indian|persian|egyptian|byzantine|japanese|korean|african)/i.test(lower)
      && /\b(monk|craftsmen|artisan|engineer|smith|worker|sailor|merchant|scholar|inventor|alchemist|physician)/i.test(lower)) return true;
  // Too short to be a real name (e.g., single word like "Unknown")
  if (name.trim().split(/\s+/).length === 1 && name.length < 5) return true;
  return false;
}

/**
 * Fuzzy match two words by shared prefix.
 * Catches Latinized spelling variants: Eupalinus↔Eupalinos, Apollodoros↔Apollodorus.
 * Requires both words ≥5 chars and a shared prefix of ≥ 75% of the shorter word.
 */
function fuzzyWordMatch(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return false;
  const minLen = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < minLen && a[shared] === b[shared]) shared++;
  return shared >= Math.ceil(minLen * 0.75);
}

/**
 * Phase 1: Search Wikipedia for a single person name.
 * Returns the best-matching Wikipedia title or null.
 * This is a lightweight call — only returns page titles, no images.
 */
async function searchForTitle(name: string): Promise<string | null> {
  const apiUrl =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=5` +
    `&prop=description|pageprops` +
    `&format=json&redirects=1`;

  const data = await fetchJsonWithRetry(apiUrl);
  const pages = data.query?.pages;
  if (!pages) return null;

  const sorted = Object.values(pages).sort(
    (a: any, b: any) => (a.index || 999) - (b.index || 999)
  );

  for (const page of sorted as any[]) {
    const title: string = page.title || "";
    const desc: string = page.description || "";

    // Skip disambiguation pages
    if (/disambiguation/i.test(desc) || /disambiguation/i.test(title)) continue;
    if (page.pageprops?.disambiguation !== undefined) continue;

    const titleNorm = title.toLowerCase().replace(/[^a-z ]/g, "");
    const nameNorm = name.toLowerCase().replace(/[^a-z ]/g, "");

    // For the #1 search result: trust Wikipedia's ranking more,
    // but still require BOTH a person-like description AND word overlap.
    // Wikipedia search handles transliterations (Wang Ch'ung → Wang Chong),
    // title prefixes (Emperor Constantine → Constantine the Great),
    // and spelling variants (Apollodoros → Apollodorus).
    if (page.index === 1) {
      const isPerson = looksLikePerson(desc);
      // Check if at least one significant word overlaps between name and title.
      // Uses fuzzy prefix matching to handle Latinized spelling variants
      // (e.g., Eupalinus/Eupalinos, Apollodoros/Apollodorus).
      const nameWords = nameNorm.split(/\s+/).filter((w: string) => w.length > 2);
      const titleWords = titleNorm.split(/\s+/).filter((w: string) => w.length > 2);
      const hasWordOverlap = nameWords.some((w: string) =>
        titleWords.some((tw: string) =>
          tw.includes(w) || w.includes(tw) || fuzzyWordMatch(w, tw)
        )
      );

      // Require both: description says it's a person AND at least one name word matches
      if (isPerson && hasWordOverlap) {
        return title;
      }
    }

    // For results #2-5: require stricter title match
    const isCloseMatch =
      titleNorm === nameNorm ||
      titleNorm.startsWith(nameNorm) ||
      nameNorm.startsWith(titleNorm) ||
      titleNorm.includes(nameNorm) ||
      nameNorm.includes(titleNorm);

    if (!isCloseMatch) continue;

    if (looksLikePerson(desc)) {
      return title;
    }
  }

  return null;
}

/**
 * Phase 2: Batch fetch pageimages + info for up to 50 titles at once.
 * Returns a map of title → { url, thumbnail, wikidataId }.
 */
async function batchFetchPageInfo(
  titles: string[]
): Promise<Map<string, { url: string; thumbnail: string | null; wikidataId: string | null }>> {
  const result = new Map<string, { url: string; thumbnail: string | null; wikidataId: string | null }>();

  const pipedTitles = titles.map((t) => encodeURIComponent(t)).join("|");
  const apiUrl =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&titles=${pipedTitles}` +
    `&prop=pageimages|pageprops|info` +
    `&pithumbsize=${THUMBNAIL_SIZE}` +
    `&inprop=url` +
    `&format=json&redirects=1`;

  const data = await fetchJsonWithRetry(apiUrl);
  const pages = data.query?.pages || {};

  // Build redirect map (redirects resolve original → final title)
  const redirectMap = new Map<string, string>();
  for (const r of data.query?.redirects || []) {
    redirectMap.set(r.from, r.to);
  }
  for (const n of data.query?.normalized || []) {
    redirectMap.set(n.from, n.to);
  }

  for (const page of Object.values(pages) as any[]) {
    if (page.missing !== undefined) continue;
    result.set(page.title, {
      url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      thumbnail: page.thumbnail?.source || null,
      wikidataId: page.pageprops?.wikibase_item || null,
    });
  }

  // Also map redirected titles to their results
  for (const [from, to] of redirectMap) {
    if (result.has(to) && !result.has(from)) {
      result.set(from, result.get(to)!);
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dbOnly = args.includes("--db-only");
  const retryErrors = args.includes("--retry-errors");
  const retryNotFound = args.includes("--retry-notfound");

  // Load seed data and extract unique persons with year ranges
  console.log("Loading seed data...");
  const raw = readFileSync(SEED_PATH, "utf-8");
  const seedData = JSON.parse(raw);

  const personMap = new Map<
    string,
    { yearFrom: number; yearTo: number; categories: Set<string> }
  >();

  for (const t of seedData.technologies as SeedTechnology[]) {
    if (!t.person) continue;
    // Split comma-separated co-contributors (e.g., "Kenneth Thomson, Dennis Ritchie")
    // Protect ", Jr." from being treated as a separator
    const safe = t.person.replace(/,\s*Jr\.?/gi, " Jr.");
    const names = safe.includes(",")
      ? safe.split(",").map((n: string) => n.trim()).filter(Boolean)
      : [safe];
    for (const name of names) {
      const existing = personMap.get(name);
      if (existing) {
        existing.yearFrom = Math.min(existing.yearFrom, t.year);
        existing.yearTo = Math.max(existing.yearTo, t.year);
        existing.categories.add(t.category);
      } else {
        personMap.set(name, {
          yearFrom: t.year,
          yearTo: t.year,
          categories: new Set([t.category]),
        });
      }
    }
  }

  console.log(`Found ${personMap.size} unique persons in seed data.`);

  // Load existing cache
  let cache: CacheMap = {};
  if (existsSync(CACHE_PATH)) {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    console.log(`Loaded cache with ${Object.keys(cache).length} entries.`);
  }

  if (!dbOnly) {
    const toFetch = [...personMap.entries()].filter(([name]) => {
      if (!cache[name]) return true;
      if (retryErrors && cache[name].status === "error") return true;
      if (retryNotFound && cache[name].status === "not_found") return true;
      return false;
    });
    console.log(`Need to fetch: ${toFetch.length} persons\n`);

    if (toFetch.length > 0) {
      const startTime = Date.now();
      let found = 0;
      let notFound = 0;
      let errors = 0;

      // ── Phase 1: Search for Wikipedia titles (1 API call per person) ──
      console.log("Phase 1: Searching for Wikipedia titles...");
      const titleMap = new Map<string, string>(); // personName → wikiTitle

      for (let i = 0; i < toFetch.length; i++) {
        const [name] = toFetch[i];
        const progress = `[${i + 1}/${toFetch.length}]`;

        // Skip generic attributions — not real person names
        if (isGenericAttribution(name)) {
          cache[name] = {
            name,
            wikipediaUrl: null,
            thumbnailUrl: null,
            wikidataId: null,
            status: "not_found",
          };
          notFound++;
          console.log(`${progress} — ${name} (skipped: generic attribution)`);
          continue;
        }

        let resolved = false;
        while (!resolved) {
          try {
            const title = await searchForTitle(name);
            if (title) {
              titleMap.set(name, title);
              console.log(`${progress} ✓ ${name} → "${title}"`);
            } else {
              cache[name] = {
                name,
                wikipediaUrl: null,
                thumbnailUrl: null,
                wikidataId: null,
                status: "not_found",
              };
              notFound++;
              console.log(`${progress} ✗ ${name}`);
            }
            resolved = true;
          } catch (err: any) {
            if (err instanceof RateLimitError) {
              writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
              const pauseMs = Math.max(err.retryAfterMs, 120_000);
              console.log(
                `  ⏸ Rate limit — saving cache & pausing ${(pauseMs / 1000).toFixed(0)}s before retrying "${name}"...`
              );
              await sleep(pauseMs);
            } else {
              cache[name] = {
                name,
                wikipediaUrl: null,
                thumbnailUrl: null,
                wikidataId: null,
                status: "error",
              };
              errors++;
              console.log(`${progress} ⚠ ${name} — ${err.message}`);
              resolved = true;
            }
          }
        }

        await sleep(RATE_LIMIT_MS);

        // Save cache every 100 entries
        if ((i + 1) % 100 === 0) {
          writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(1);
          console.log(
            `  — Phase 1 progress: ${i + 1}/${toFetch.length}, ${elapsed}s, ${rate}/s, matched=${titleMap.size}`
          );
        }
      }

      console.log(`\nPhase 1 complete: ${titleMap.size} titles matched, ${notFound} not found, ${errors} errors`);

      // ── Phase 2: Batch fetch page info (1 API call per 50 titles) ──
      if (titleMap.size > 0) {
        console.log(`\nPhase 2: Fetching page info in batches of ${BATCH_SIZE}...`);
        const entries = [...titleMap.entries()];
        let batchNum = 0;

        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          batchNum++;
          const titles = batch.map(([, title]) => title);

          let resolved = false;
          while (!resolved) {
            try {
              console.log(`  Batch ${batchNum}: fetching ${titles.length} pages...`);
              const pageInfo = await batchFetchPageInfo(titles);

              for (const [personName, wikiTitle] of batch) {
                const info = pageInfo.get(wikiTitle);
                if (info) {
                  cache[personName] = {
                    name: personName,
                    wikipediaUrl: info.url,
                    thumbnailUrl: info.thumbnail,
                    wikidataId: info.wikidataId,
                    status: "found",
                  };
                  found++;
                } else {
                  cache[personName] = {
                    name: personName,
                    wikipediaUrl: null,
                    thumbnailUrl: null,
                    wikidataId: null,
                    status: "not_found",
                  };
                  notFound++;
                }
              }
              resolved = true;
            } catch (err: any) {
              if (err instanceof RateLimitError) {
                const pauseMs = Math.max(err.retryAfterMs, 120_000);
                console.log(
                  `  ⏸ Rate limit on batch ${batchNum} — pausing ${(pauseMs / 1000).toFixed(0)}s...`
                );
                await sleep(pauseMs);
              } else {
                // Mark all in batch as error
                for (const [personName] of batch) {
                  cache[personName] = {
                    name: personName,
                    wikipediaUrl: null,
                    thumbnailUrl: null,
                    wikidataId: null,
                    status: "error",
                  };
                  errors++;
                }
                console.log(`  ⚠ Batch ${batchNum} failed: ${err.message}`);
                resolved = true;
              }
            }
          }

          await sleep(RATE_LIMIT_MS);
        }

        // Save after phase 2
        writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`\nFetch complete in ${totalTime}s:`);
      console.log(`  Found:     ${found}`);
      console.log(`  Not found: ${notFound}`);
      console.log(`  Errors:    ${errors}`);
    }
  }

  // Summary of cache state
  const allEntries = Object.values(cache);
  const withUrl = allEntries.filter((e) => e.status === "found");
  const withThumb = allEntries.filter((e) => e.thumbnailUrl);
  const withErrors = allEntries.filter((e) => e.status === "error");
  console.log(`\nCache summary:`);
  console.log(`  Total entries:   ${allEntries.length}`);
  console.log(`  With Wikipedia:  ${withUrl.length}`);
  console.log(`  With thumbnail:  ${withThumb.length}`);
  console.log(`  Not found:       ${allEntries.length - withUrl.length - withErrors.length}`);
  console.log(`  Errors:          ${withErrors.length}`);

  // Write to MongoDB
  if (dryRun) {
    console.log("\n--dry-run: Skipping database write.");
    return;
  }

  const MONGO_URL =
    process.env.MONGO_URL || "mongodb://localhost:27017/techrelative";
  console.log(`\nConnecting to: ${MONGO_URL}`);
  await mongoose.connect(MONGO_URL);

  const personsToWrite = allEntries.filter((e) => e.status === "found");
  console.log(`Writing ${personsToWrite.length} persons to MongoDB...`);

  const bulkOps = personsToWrite.map((p) => ({
    updateOne: {
      filter: { name: p.name },
      update: {
        $set: {
          name: p.name,
          wikipediaUrl: p.wikipediaUrl,
          thumbnailUrl: p.thumbnailUrl,
        },
      },
      upsert: true,
    },
  }));

  // Process in batches of 500
  let written = 0;
  for (let i = 0; i < bulkOps.length; i += 500) {
    const batch = bulkOps.slice(i, i + 500);
    const result = await Person.bulkWrite(batch);
    written += result.upsertedCount + result.modifiedCount;
  }

  console.log(`  Written: ${written} persons`);
  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
