import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";
import { Technology } from "./models/Technology.js";
import { Relation } from "./models/Relation.js";
import { Person } from "./models/Person.js";

dotenv.config();

// ── Types for seed_data.json (snake_case from Python) ─────────────────

interface SeedTechnology {
  name: string;
  year: number;
  year_display: string;
  era: string;
  category: string;
  tags: string[];
  description: string;
  region: string;
  person: string | null;
  see_also: string[];
}

interface SeedRelation {
  from: string;
  to: string;
  type: string;
  from_year: number;
  to_year: number;
}

interface SeedData {
  technologies: SeedTechnology[];
  relations: SeedRelation[];
}

// ── Main ──────────────────────────────────────────────────────────────

async function seed() {
  const MONGO_URL =
    process.env.MONGO_URL || "mongodb://localhost:27017/techrelative";

  const dataPath = process.argv[2] || resolve("data", "seed_data.json");

  console.log(`Loading seed data from: ${dataPath}`);
  const raw = readFileSync(dataPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  console.log(`  Technologies: ${data.technologies.length}`);
  console.log(`  Relations:    ${data.relations.length}`);


  console.log(`\nConnecting to: ${MONGO_URL}`);
  await mongoose.connect(MONGO_URL);
  console.log("Connected.\n");

  // ── Clear existing data ──
  console.log("Clearing existing data...");
  await Technology.deleteMany({});
  await Relation.deleteMany({});
  await Person.deleteMany({});

  // ── Insert technologies ──
  console.log("Inserting technologies...");
  const techDocs = data.technologies.map((t) => ({
    name: t.name,
    year: t.year,
    yearDisplay: t.year_display,
    era: t.era,
    category: t.category,
    tags: t.tags,
    description: t.description,
    region: t.region || null,
    person: t.person || null,
  }));

  const inserted = await Technology.insertMany(techDocs, { ordered: false });
  console.log(`  Inserted ${inserted.length} technologies`);

  // ── Build lookups from inserted docs ──
  const techByNameYear = new Map<string, mongoose.Types.ObjectId>();
  const techByName = new Map<string, mongoose.Types.ObjectId>();

  for (const doc of inserted) {
    const key = `${doc.name}::${doc.year}`;
    techByNameYear.set(key, doc._id);
    techByName.set(doc.name, doc._id);
  }

  // ── Insert relations ──
  console.log("Inserting relations...");
  let resolved = 0;
  let unresolved = 0;

  const relationDocs: Array<{
    from: mongoose.Types.ObjectId;
    to: mongoose.Types.ObjectId;
    type: string;
    fromYear: number;
    toYear: number;
  }> = [];

  for (const r of data.relations) {
    // Try name+year first, fall back to name only
    const fromId =
      techByNameYear.get(`${r.from}::${r.from_year}`) ||
      techByName.get(r.from);
    const toId =
      techByNameYear.get(`${r.to}::${r.to_year}`) || techByName.get(r.to);

    if (fromId && toId) {
      relationDocs.push({
        from: fromId,
        to: toId,
        type: r.type,
        fromYear: r.from_year,
        toYear: r.to_year,
      });
      resolved++;
    } else {
      unresolved++;
    }
  }

  if (relationDocs.length > 0) {
    // Use ordered: false to skip duplicates
    try {
      const insertedRels = await Relation.insertMany(relationDocs, {
        ordered: false,
      });
      console.log(`  Inserted ${insertedRels.length} relations`);
    } catch (err: any) {
      // With ordered: false, duplicates throw BulkWriteError but others succeed
      const insertedCount = err.insertedDocs?.length ?? resolved;
      console.log(`  Inserted ${insertedCount} relations (some duplicates skipped)`);
    }
  }
  console.log(`  Resolved: ${resolved} | Unresolved: ${unresolved}`);

  // ── Summary ──
  console.log("\n═══ Seed complete ═══");
  console.log(`  Technologies: ${inserted.length}`);
  console.log(`  Relations:    ${resolved}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
