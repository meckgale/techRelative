import { Router, type Request, type Response } from "express";
import { Technology, ERAS, CATEGORIES } from "../models/Technology.js";
import { Relation } from "../models/Relation.js";
import { Biography } from "../models/Biography.js";

const router = Router();

// Simple in-memory cache for graph data
const graphCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── GET /api/technologies ─────────────────────────────────────────────
// Query params: era, category, search, page, limit

router.get("/technologies", async (req: Request, res: Response) => {
  try {
    const { era, category, search, page = "1", limit = "50" } = req.query;

    const filter: Record<string, any> = {};
    if (era && typeof era === "string") filter.era = era;
    if (category && typeof category === "string") filter.category = category;
    if (search && typeof search === "string") {
      filter.$text = { $search: search };
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string)));

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

router.get("/technologies/:id", async (req: Request, res: Response) => {
  try {
    const tech = await Technology.findById(req.params.id).lean();
    if (!tech) {
      res.status(404).json({ error: "Technology not found" });
      return;
    }

    // Get relations involving this technology
    const relations = await Relation.find({
      $or: [{ from: tech._id }, { to: tech._id }],
    })
      .populate("from", "name year yearDisplay category")
      .populate("to", "name year yearDisplay category")
      .lean();

    res.json({ technology: tech, relations });
  } catch (err) {
    console.error("GET /technologies/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/graph ────────────────────────────────────────────────────
// Returns nodes + edges for graph rendering
// Query params: era, category (optional filters)

router.get("/graph", async (req: Request, res: Response) => {
  try {
    const { era, category } = req.query;

    const filter: Record<string, any> = {};
    if (era && typeof era === "string") filter.era = era;
    if (category && typeof category === "string") filter.category = category;

    // Create cache key
    const cacheKey = JSON.stringify(filter);
    const cached = graphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    const technologies = await Technology.find(filter)
      .select("name year yearDisplay era category civilization person")
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
    const [techCount, relCount, bioCount, byEra, byCategory] =
      await Promise.all([
        Technology.countDocuments(),
        Relation.countDocuments(),
        Biography.countDocuments(),
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
      biographies: bioCount,
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

// ── GET /api/biographies ──────────────────────────────────────────────

router.get("/biographies", async (_req: Request, res: Response) => {
  try {
    const biographies = await Biography.find().sort({ name: 1 }).lean();
    res.json({ biographies });
  } catch (err) {
    console.error("GET /biographies error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
