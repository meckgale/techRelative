import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Types ──

interface SeedTechnology {
  name: string;
  year: number;
  year_display: string;
  era: string;
  category: string;
  tags: string[];
  description: string;
  region: string;
  person: string | string[] | null;
  see_also: string[];
}

interface SeedData {
  technologies: SeedTechnology[];
  relations: unknown[];
  biographies: unknown[];
}

interface Change {
  index: number;
  techName: string;
  oldPerson: string;
  newPerson: string;
}

interface FlaggedGroup {
  shortName: string;
  candidates: string[];
}

// ── Constants ──

// Manual resolutions for flagged ambiguous names (reviewed & year-validated)
const MANUAL_RESOLUTIONS = new Map<string, string>([
  // Single-word → full name (same person confirmed by year ranges)
  ["Al-Khwarizmi", "Muhammad Al-Khwarizmi"],
  ["Baumé", "Antoine Baumé"],
  ["Bramante", "Donato Bramante"],
  ["Copernicus", "Nicolaus Copernicus"],
  ["Descartes", "René Descartes"],
  ["Einstein", "Albert Einstein"],
  ["Hooke", "Robert Hooke"],
  ["Kepler", "Johannes Kepler"],
  ["Leeuwenhoek", "Anton van Leeuwenhoek"],
  ["Leibniz", "Gottfried Wilhelm Leibniz"],
  ["Paracelsus", "Philippus Aureolus Paracelsus"],
  ["Pascal", "Blaise Pascal"],
  ["Priestley", "Joseph Priestley"],
  ["Rheticus", "Georg Joachim Rheticus"],

  // Single-word with multiple real people — merge bare name to most prominent
  ["Darwin", "Charles Darwin"],
  ["Edison", "Thomas Alva Edison"],
  ["Newton", "Isaac Newton"],
  ["Euler", "Leonhard Euler"],
  ["Gauss", "Carl Friedrich Gauss"],
  ["Lavoisier", "Antoine-Laurent Lavoisier"],

  // Short form → full name (different first name, same person confirmed)
  ["Alexander von Humboldt", "Friedrich Heinrich Alexander von Humboldt"],
  ["Antoine Lavoisier", "Antoine-Laurent Lavoisier"],
  ["Bernard Lovell", "Alfred Charles Bernard Lovell"],
  ["Duhamel du Monceau", "Henri Louis Duhamel du Monceau"],
  ["Flinders Petrie", "William Matthew Flinders Petrie"],
  ["Henri Moissan", "Ferdinand Frédéric Henri Moissan"],
  ["Karl Friedrich Gauss", "Carl Friedrich Gauss"],
  ["Maurice Ewing", "William Maurice Ewing"],
  ["Thomas Edison", "Thomas Alva Edison"],
  ["Victor Grignard", "François Auguste Victor Grignard"],
  ["Werner von Siemens", "Ernst Werner von Siemens"],
  ["William Beebe", "Charles William Beebe"],
]);

const TITLE_PREFIXES = [
  "Sir ",
  "Abbé ",
  "Baron ",
  "Count ",
  "Lord ",
  "Prince ",
  "Saint ",
  "St. ",
  "Admiral ",
  "Caliph ",
  "Pharaoh ",
];

const LOWERCASE_PARTICLES = [
  "de",
  "di",
  "du",
  "von",
  "van",
  "al-",
  "ibn",
  "la",
  "le",
  "el",
  "del",
  "der",
  "den",
  "af",
];

// ── Phase 1: Split person strings into individual names ──

function startsWithTitle(s: string): boolean {
  return TITLE_PREFIXES.some((prefix) => s.startsWith(prefix));
}

function splitPersonString(raw: string): string[] {
  // Protect ", Jr." from being treated as a separator
  let text = raw.replace(/,\s*Jr\.?/gi, "§JR§");

  // Split on comma
  const commaParts = text.split(/,\s*/);

  // Re-join parts where the next part starts with a title prefix
  // e.g. "Thomas Bruce, Lord Elgin" → keep as one entry
  // e.g. "Jean-Baptiste Joseph, Baron Fourier" → keep as one entry
  const rejoined: string[] = [];
  for (let i = 0; i < commaParts.length; i++) {
    const part = commaParts[i].trim();
    if (i > 0 && startsWithTitle(part)) {
      // This looks like "Title Surname" after a comma — rejoin with previous
      rejoined[rejoined.length - 1] += ", " + part;
    } else {
      rejoined.push(part);
    }
  }

  // Further split on " and " only if both sides look like full names (2+ words each)
  const expanded: string[] = [];
  for (const part of rejoined) {
    if (/ and /.test(part)) {
      const andParts = part.split(/ and /);
      const allFullNames = andParts.every(
        (p) => p.trim().split(/\s+/).length >= 2
      );
      if (allFullNames) {
        expanded.push(...andParts.map((p) => p.trim()));
      } else {
        expanded.push(part.trim());
      }
    } else {
      expanded.push(part.trim());
    }
  }

  // Restore Jr. placeholders and filter empties
  return expanded
    .map((p) => p.replace("§JR§", ", Jr."))
    .filter((p) => p.length > 0);
}

// ── Phase 2: Build canonical name map ──

function stripTitle(name: string): { stripped: string; hadTitle: boolean } {
  for (const prefix of TITLE_PREFIXES) {
    if (name.startsWith(prefix)) {
      return { stripped: name.slice(prefix.length), hadTitle: true };
    }
  }
  return { stripped: name, hadTitle: false };
}

function fixLatex(name: string): string {
  // Handle \"{u} -> ü style LaTeX escapes
  return name.replace(/\\"\{(\w)\}/g, (_match, char: string) => {
    const map: Record<string, string> = {
      a: "ä",
      o: "ö",
      u: "ü",
      A: "Ä",
      O: "Ö",
      U: "Ü",
    };
    return map[char] || char;
  });
}

function normalizeParticleCase(name: string): string {
  const words = name.split(/\s+/);
  if (words.length < 2) return name;

  return words
    .map((word, i) => {
      // Don't touch the first word or last word (usually surname)
      if (i === 0 || i === words.length - 1) return word;
      // Check if this word is a particle
      const lower = word.toLowerCase();
      if (
        LOWERCASE_PARTICLES.includes(lower) ||
        LOWERCASE_PARTICLES.includes(lower.replace(/-$/, "") + "-")
      ) {
        return lower;
      }
      return word;
    })
    .join(" ");
}

function isContiguousSubsequence(
  shorterWords: string[],
  longerWords: string[]
): boolean {
  // Check if shorterWords appears as a contiguous block within longerWords
  const sLen = shorterWords.length;
  const lLen = longerWords.length;
  if (sLen > lLen) return false;

  for (let i = 0; i <= lLen - sLen; i++) {
    let match = true;
    for (let j = 0; j < sLen; j++) {
      if (shorterWords[j].toLowerCase() !== longerWords[i + j].toLowerCase()) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function buildCanonicalMap(allNames: string[]): {
  canonMap: Map<string, string>;
  flagged: FlaggedGroup[];
} {
  const canonMap = new Map<string, string>();
  const flagged: FlaggedGroup[] = [];

  // Step 1: Apply LaTeX fixes to all names
  const latexFixed = new Map<string, string>();
  for (const name of allNames) {
    const fixed = fixLatex(name);
    if (fixed !== name) {
      latexFixed.set(name, fixed);
      canonMap.set(name, fixed);
    }
  }

  // Build a working set of names (after latex fixes)
  const workingNames = allNames.map((n) => latexFixed.get(n) || n);
  const uniqueWorking = [...new Set(workingNames)];

  // Step 2: Strip titles — map titled form to untitled
  // Skip names with parentheses — these are alternate name forms like
  // "Count Rumford (Benjamin Thompson)" where the title is part of identity
  const titleStripped = new Map<string, string>();
  for (const name of uniqueWorking) {
    if (name.includes("(")) continue;
    const { stripped, hadTitle } = stripTitle(name);
    if (hadTitle) {
      titleStripped.set(name, stripped);
      // Map original (possibly latex-fixed) to stripped
      canonMap.set(name, stripped);
      // Also map the original pre-latex name if it was latex fixed
      for (const [orig, fixed] of latexFixed) {
        if (fixed === name) {
          canonMap.set(orig, stripped);
        }
      }
    }
  }

  // Updated working names after title stripping
  const postTitleNames = uniqueWorking.map(
    (n) => titleStripped.get(n) || n
  );
  const uniquePostTitle = [...new Set(postTitleNames)];

  // Step 3: Normalize particle case
  const particleNormalized = new Map<string, string>();
  for (const name of uniquePostTitle) {
    const normalized = normalizeParticleCase(name);
    if (normalized !== name) {
      particleNormalized.set(name, normalized);
    }
  }

  // Step 4: Case-insensitive dedup — group names that differ only in case
  const caseGroups = new Map<string, string[]>();
  for (const name of uniquePostTitle) {
    const key = name.toLowerCase();
    if (!caseGroups.has(key)) caseGroups.set(key, []);
    caseGroups.get(key)!.push(name);
  }

  const caseCanonical = new Map<string, string>();
  for (const [, variants] of caseGroups) {
    if (variants.length > 1) {
      // Pick the one with proper particle casing, or the most common form
      const best =
        variants.find((v) => v === normalizeParticleCase(v)) || variants[0];
      for (const v of variants) {
        if (v !== best) {
          caseCanonical.set(v, best);
        }
      }
    }
  }

  // Step 5: Substring matching for name consolidation
  // Get the final resolved name for each original
  const resolveCanonical = (name: string): string => {
    let n = name;
    if (latexFixed.has(n)) n = latexFixed.get(n)!;
    if (titleStripped.has(n)) n = titleStripped.get(n)!;
    if (particleNormalized.has(n)) n = particleNormalized.get(n)!;
    if (caseCanonical.has(n)) n = caseCanonical.get(n)!;
    return n;
  };

  const resolvedNames = [...new Set(uniquePostTitle.map(resolveCanonical))];

  // Group by last name for substring matching
  const byLastName = new Map<string, string[]>();
  for (const name of resolvedNames) {
    // Skip names with parentheses or "and" — these are special forms
    if (name.includes("(") || / and /.test(name)) continue;

    const words = name.split(/\s+/);
    const lastName = words[words.length - 1].toLowerCase();
    if (!byLastName.has(lastName)) byLastName.set(lastName, []);
    byLastName.get(lastName)!.push(name);
  }

  const substringCanonical = new Map<string, string>();
  const flaggedSet = new Map<string, Set<string>>();

  for (const [, names] of byLastName) {
    if (names.length < 2) continue;

    // Sort by word count descending (prefer longer names)
    const sorted = [...names].sort(
      (a, b) => b.split(/\s+/).length - a.split(/\s+/).length
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const longer = sorted[i];
        const shorter = sorted[j];

        const shorterWords = shorter.split(/\s+/);
        const longerWords = longer.split(/\s+/);

        // Skip single-word names — always flag, never auto-merge
        if (shorterWords.length < 2) {
          if (!flaggedSet.has(shorter))
            flaggedSet.set(shorter, new Set());
          flaggedSet.get(shorter)!.add(longer);
          continue;
        }

        // Both names must share the same last name (surname)
        if (
          shorterWords[shorterWords.length - 1].toLowerCase() !==
          longerWords[longerWords.length - 1].toLowerCase()
        ) {
          continue;
        }

        // Check if shorter is a contiguous subsequence of longer
        const isSubseq = isContiguousSubsequence(shorterWords, longerWords);
        if (!isSubseq) {
          // No substring relationship — these are different people, skip
          continue;
        }

        // Shorter IS a subsequence of longer.
        // Auto-merge only if they share the same first name
        // e.g. "Niels Abel" → "Niels Henrik Abel" (safe)
        // but NOT "Victor Grignard" → "François Auguste Victor Grignard" (flag)
        if (
          shorterWords[0].toLowerCase() === longerWords[0].toLowerCase()
        ) {
          substringCanonical.set(shorter, longer);
        } else {
          // Different first name but one contains the other — flag for review
          if (!flaggedSet.has(shorter))
            flaggedSet.set(shorter, new Set());
          flaggedSet.get(shorter)!.add(longer);
        }
      }
    }
  }

  // Build final canonMap by chaining all transformations
  // We need to map every original name to its final canonical form
  const allOriginals = new Set(allNames);
  for (const orig of allOriginals) {
    let current = orig;

    // Apply latex fix
    if (latexFixed.has(current)) current = latexFixed.get(current)!;

    // Apply title strip
    if (titleStripped.has(current)) current = titleStripped.get(current)!;

    // Apply particle normalization
    if (particleNormalized.has(current))
      current = particleNormalized.get(current)!;

    // Apply case normalization
    if (caseCanonical.has(current)) current = caseCanonical.get(current)!;

    // Apply substring merging
    if (substringCanonical.has(current))
      current = substringCanonical.get(current)!;

    // Apply manual resolutions (overrides all above)
    if (MANUAL_RESOLUTIONS.has(current))
      current = MANUAL_RESOLUTIONS.get(current)!;

    if (current !== orig) {
      canonMap.set(orig, current);
    }
  }

  // Convert flagged set to array, excluding manually resolved entries
  for (const [short, candidates] of flaggedSet) {
    if (candidates.size > 0 && !MANUAL_RESOLUTIONS.has(short)) {
      flagged.push({
        shortName: short,
        candidates: [short, ...candidates],
      });
    }
  }

  return { canonMap, flagged };
}

// ── Phase 3 & 4: Apply and report ──

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dataPath = resolve(__dirname, "../data/seed_data.json");

  console.log(`Reading ${dataPath}...`);
  const raw = readFileSync(dataPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  console.log(`Total technologies: ${data.technologies.length}`);

  // Phase 1: Extract all individual names
  const nameToTechIndices = new Map<string, number[]>();
  const arrayConversions: { index: number; techName: string; old: string[]; new_: string }[] = [];

  for (let i = 0; i < data.technologies.length; i++) {
    const tech = data.technologies[i];
    const person = tech.person;
    if (person == null) continue;

    let personStr: string;

    // Convert arrays to comma-separated strings
    if (Array.isArray(person)) {
      personStr = person.join(", ");
      arrayConversions.push({
        index: i,
        techName: tech.name,
        old: person as string[],
        new_: personStr,
      });
    } else if (typeof person === "string" && person.trim()) {
      personStr = person.trim();
    } else {
      continue;
    }

    // Split into individual names
    const individuals = splitPersonString(personStr);
    for (const name of individuals) {
      if (!nameToTechIndices.has(name)) nameToTechIndices.set(name, []);
      nameToTechIndices.get(name)!.push(i);
    }
  }

  const allNames = [...nameToTechIndices.keys()];
  console.log(`Unique individual names extracted: ${allNames.length}`);

  // Phase 2: Build canonical map
  const { canonMap, flagged } = buildCanonicalMap(allNames);

  console.log(`Canonical mappings found: ${canonMap.size}`);
  console.log(`Flagged for review: ${flagged.length}`);

  // Phase 3: Apply changes
  const changes: Change[] = [];

  for (let i = 0; i < data.technologies.length; i++) {
    const tech = data.technologies[i];
    const person = tech.person;
    if (person == null) continue;

    let personStr: string;
    if (Array.isArray(person)) {
      personStr = (person as string[]).join(", ");
    } else if (typeof person === "string" && person.trim()) {
      personStr = person.trim();
    } else {
      continue;
    }

    // Split, normalize each individual, rejoin
    const individuals = splitPersonString(personStr);
    const normalized = individuals.map((name) => canonMap.get(name) || name);
    const newPerson = normalized.join(", ");

    if (newPerson !== personStr) {
      changes.push({
        index: i,
        techName: tech.name,
        oldPerson: personStr,
        newPerson: newPerson,
      });
    }

    // Always write back as string (handles array→string conversion too)
    if (newPerson !== tech.person) {
      (tech as { person: string }).person = newPerson;
    }
  }

  // Phase 4: Report
  console.log("\n" + "═".repeat(60));
  console.log(" Person Name Normalization Report");
  console.log("═".repeat(60));

  // Array conversions
  if (arrayConversions.length > 0) {
    console.log(`\n📋 Array → String Conversions: ${arrayConversions.length}`);
    for (const ac of arrayConversions) {
      console.log(`  [${ac.index}] ${ac.techName}`);
      console.log(`    ${JSON.stringify(ac.old)} → "${ac.new_}"`);
    }
  }

  // Name normalizations
  if (changes.length > 0) {
    console.log(`\n🔄 Name Normalizations Applied: ${changes.length}`);
    for (const c of changes) {
      console.log(`  [${c.index}] ${c.techName}`);
      console.log(`    "${c.oldPerson}" → "${c.newPerson}"`);
    }
  } else {
    console.log("\n✅ No name normalizations needed.");
  }

  // Flagged items
  if (flagged.length > 0) {
    console.log(`\n⚠️  Flagged for Manual Review: ${flagged.length}`);
    flagged.sort((a, b) => a.shortName.localeCompare(b.shortName));
    for (const f of flagged) {
      console.log(`  "${f.shortName}" might be:`);
      for (const c of f.candidates) {
        const techs = nameToTechIndices.get(c) || [];
        const techNames = techs
          .slice(0, 3)
          .map((i) => data.technologies[i].name);
        console.log(
          `    - "${c}" (${techs.length} tech${techs.length !== 1 ? "s" : ""}: ${techNames.join(", ")}${techs.length > 3 ? ", ..." : ""})`
        );
      }
    }
  }

  // Summary
  console.log("\n" + "─".repeat(60));
  console.log(
    `Summary: ${arrayConversions.length} array conversions, ${changes.length} normalizations, ${flagged.length} flagged`
  );
  console.log("─".repeat(60));

  // Write back
  if (dryRun) {
    console.log("\n🔍 DRY RUN — no changes written to disk.");
  } else {
    writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`\n✅ Written to ${dataPath}`);
    console.log("   Run 'npm run seed' to apply changes to the database.");
  }
}

main();
