import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import { Technology, ERAS, CATEGORIES } from "../models/Technology.js";
import { Relation } from "../models/Relation.js";
import { Person } from "../models/Person.js";
import {
  validate,
  technologiesQuery,
  technologyIdParam,
  graphQuery,
  personNameParam,
  personsSearchQuery,
} from "../validation.js";

const router = Router();

// Simple in-memory cache for graph data with automatic expiry cleanup
export const graphCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of graphCache) {
    if (now - entry.timestamp >= CACHE_TTL) graphCache.delete(key);
  }
}, CACHE_TTL);

// ── GET /api/technologies ─────────────────────────────────────────────
// Query params: era, category, search, page, limit

router.get("/technologies", validate(technologiesQuery), async (req: Request, res: Response) => {
  try {
    const { era, category, search, page, limit } = req.query as unknown as {
      era?: string; category?: string; search?: string; page: number; limit: number;
    };

    const filter: Record<string, any> = {};
    if (era) filter.era = era;
    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };

    const pageNum = page;
    const limitNum = limit;

    const [technologies, total] = await Promise.all([
      Technology.find(filter)
        .sort({ year: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Technology.countDocuments(filter),
    ]);

    res.json({
      technologies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("GET /technologies error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/technologies/:id ─────────────────────────────────────────

router.get("/technologies/:id", validate(technologyIdParam, "params"), async (req: Request, res: Response) => {
  try {
    const techId = new mongoose.Types.ObjectId(req.params.id as string);

    const tech = await Technology.findById(techId).lean();
    if (!tech) {
      res.status(404).json({ error: "Technology not found" });
      return;
    }

    // Single aggregation with $lookup instead of N+1 populate calls
    const relations = await Relation.aggregate([
      { $match: { $or: [{ from: techId }, { to: techId }] } },
      {
        $lookup: {
          from: "technologies",
          localField: "from",
          foreignField: "_id",
          as: "fromTech",
          pipeline: [
            { $project: { name: 1, year: 1, yearDisplay: 1, category: 1 } },
          ],
        },
      },
      {
        $lookup: {
          from: "technologies",
          localField: "to",
          foreignField: "_id",
          as: "toTech",
          pipeline: [
            { $project: { name: 1, year: 1, yearDisplay: 1, category: 1 } },
          ],
        },
      },
      {
        $project: {
          from: { $arrayElemAt: ["$fromTech", 0] },
          to: { $arrayElemAt: ["$toTech", 0] },
          type: 1,
          fromYear: 1,
          toYear: 1,
        },
      },
    ]);

    res.json({ technology: tech, relations });
  } catch (err) {
    console.error("GET /technologies/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/graph ────────────────────────────────────────────────────
// Returns nodes + edges for graph rendering
// Query params: era, category (optional filters)

router.get("/graph", validate(graphQuery), async (req: Request, res: Response) => {
  try {
    const { era, category } = req.query as unknown as { era?: string; category?: string };

    const filter: Record<string, any> = {};
    if (era) filter.era = era;
    if (category) filter.category = category;

    const cacheKey = `graph:${era || ""}:${category || ""}`;
    const cached = graphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    const technologies = await Technology.find(filter)
      .select("name year yearDisplay era category region person")
      .sort({ year: 1 })
      .lean();

    const techIds = new Set(technologies.map((t) => t._id.toString()));

    // Get relations where both ends are in the filtered set
    const allRelations = await Relation.find({
      from: { $in: [...techIds] },
      to: { $in: [...techIds] },
    }).lean();

    // Only include edges where both nodes are present
    const edges = allRelations.filter(
      (r) => techIds.has(r.from.toString()) && techIds.has(r.to.toString())
    );

    const data = {
      nodes: technologies,
      edges: edges.map((r) => ({
        source: r.from,
        target: r.to,
        type: r.type,
      })),
      meta: {
        nodeCount: technologies.length,
        edgeCount: edges.length,
      },
    };

    // Cache the result
    graphCache.set(cacheKey, { data, timestamp: Date.now() });

    res.json(data);
  } catch (err) {
    console.error("GET /graph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/stats ────────────────────────────────────────────────────

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [techCount, relCount, byEra, byCategory] =
      await Promise.all([
        Technology.countDocuments(),
        Relation.countDocuments(),
        Technology.aggregate([
          { $group: { _id: "$era", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        Technology.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.json({
      technologies: techCount,
      relations: relCount,
      byEra: Object.fromEntries(byEra.map((e) => [e._id, e.count])),
      byCategory: Object.fromEntries(byCategory.map((c) => [c._id, c.count])),
      eras: ERAS,
      categories: CATEGORIES,
    });
  } catch (err) {
    console.error("GET /stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/persons/:name ─────────────────────────────────────────────
// Aggregates all technologies by a person name to build a profile

router.get("/persons/:name", validate(personNameParam, "params"), async (req: Request, res: Response) => {
  try {
    const name = decodeURIComponent(req.params.name as string);

    // Fetch technologies and stored Wikipedia data in parallel
    const [technologies, personDoc] = await Promise.all([
      Technology.find({
        person: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
      })
        .sort({ year: 1 })
        .lean(),
      Person.findOne({ name }).lean(),
    ]);

    if (technologies.length === 0) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    // Aggregate profile data from technologies
    const years = technologies.map((t) => t.year);
    const eras = [...new Set(technologies.map((t) => t.era))];
    const categories = [...new Set(technologies.map((t) => t.category))];
    const tags = [...new Set(technologies.flatMap((t) => t.tags || []))];

    const contributions = technologies.map((t) => ({
      _id: t._id,
      name: t.name,
      year: t.year,
      yearDisplay: t.yearDisplay,
      era: t.era,
      category: t.category,
      description: t.description,
    }));

    res.json({
      person: {
        name,
        activeFrom: Math.min(...years),
        activeTo: Math.max(...years),
        eras,
        categories,
        tags,
        contributionCount: technologies.length,
        wikipediaUrl: personDoc?.wikipediaUrl || null,
        thumbnailUrl: personDoc?.thumbnailUrl || null,
      },
      contributions,
    });
  } catch (err) {
    console.error("GET /persons/:name error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ── GET /api/persons-graph ─────────────────────────────────────────────
// Returns person nodes + derived edges for graph rendering
// Persons are aggregated from technologies; edges derived from tech relations

router.get("/persons-graph", validate(graphQuery), async (req: Request, res: Response) => {
  try {
    const { era, category } = req.query as unknown as { era?: string; category?: string };

    const filter: Record<string, any> = { person: { $nin: [null, ""] } };
    if (era) filter.era = era;
    if (category) filter.category = category;

    // Cache
    const cacheKey = `persons:${era || ""}:${category || ""}`;
    const cached = graphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    // 1. Get all technologies that have a person
    const technologies = await Technology.find(filter)
      .select("_id name year yearDisplay era category person")
      .lean();

    // 2. Aggregate persons from technologies
    const personMap = new Map<
      string,
      {
        years: number[];
        eras: Map<string, number>;
        categories: Map<string, number>;
        techIds: Set<string>;
      }
    >();

    const techToPersonMap = new Map<string, string>();

    for (const tech of technologies) {
      if (!tech.person) continue;
      const name = tech.person;
      const techId = tech._id.toString();

      techToPersonMap.set(techId, name);

      let entry = personMap.get(name);
      if (!entry) {
        entry = {
          years: [],
          eras: new Map(),
          categories: new Map(),
          techIds: new Set(),
        };
        personMap.set(name, entry);
      }
      entry.years.push(tech.year);
      entry.eras.set(tech.era, (entry.eras.get(tech.era) || 0) + 1);
      entry.categories.set(
        tech.category,
        (entry.categories.get(tech.category) || 0) + 1,
      );
      entry.techIds.add(techId);
    }

    // Build person nodes
    const nodes = Array.from(personMap.entries()).map(([name, entry]) => {
      const avgYear =
        entry.years.reduce((a, b) => a + b, 0) / entry.years.length;
      // Most frequent era and category for coloring
      const era = [...entry.eras.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const cat = [...entry.categories.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0][0];

      return {
        _id: name,
        name,
        year: Math.round(avgYear),
        yearDisplay: formatYear(Math.round(avgYear)),
        era,
        category: cat,
        contributionCount: entry.years.length,
      };
    });

    // 3. Derive person-to-person edges from tech relations
    const allTechIds = technologies.map((t) => t._id);
    const relations = await Relation.find({
      from: { $in: allTechIds },
      to: { $in: allTechIds },
    }).lean();

    const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

    for (const rel of relations) {
      const fromPerson = techToPersonMap.get(rel.from.toString());
      const toPerson = techToPersonMap.get(rel.to.toString());
      if (!fromPerson || !toPerson || fromPerson === toPerson) continue;

      // Canonical key (undirected)
      const [a, b] = fromPerson < toPerson
        ? [fromPerson, toPerson]
        : [toPerson, fromPerson];
      const key = `${a}||${b}`;

      const existing = edgeMap.get(key);
      if (existing) {
        existing.weight++;
      } else {
        edgeMap.set(key, { source: a, target: b, weight: 1 });
      }
    }

    const edgesArr = Array.from(edgeMap.values());

    const data = {
      nodes,
      edges: edgesArr,
      meta: {
        nodeCount: nodes.length,
        edgeCount: edgesArr.length,
      },
    };

    graphCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (err) {
    console.error("GET /persons-graph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatYear(year: number): string {
  if (year <= 0) return `${Math.abs(year)} BCE`;
  return `${year} CE`;
}

// ── GET /api/persons-search ───────────────────────────────────────────
// Search persons by name, returns deduplicated list

router.get("/persons-search", validate(personsSearchQuery), async (req: Request, res: Response) => {
  try {
    const { search, limit } = req.query as unknown as { search?: string; limit: number };
    if (!search || search.length < 2) {
      return res.json({ persons: [] });
    }

    const limitNum = limit;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const results = await Technology.aggregate([
      { $match: { person: { $regex: escaped, $options: "i" } } },
      {
        $group: {
          _id: "$person",
          contributionCount: { $sum: 1 },
          era: { $first: "$era" },
          category: { $first: "$category" },
          yearDisplay: { $first: "$yearDisplay" },
        },
      },
      { $sort: { contributionCount: -1 } },
      { $limit: limitNum },
      {
        $project: {
          _id: 0,
          name: "$_id",
          contributionCount: 1,
          era: 1,
          category: 1,
          yearDisplay: 1,
        },
      },
    ]);

    res.json({ persons: results });
  } catch (err) {
    console.error("GET /persons-search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
