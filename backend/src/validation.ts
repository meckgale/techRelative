import { z, type ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";
import { ERAS, CATEGORIES } from "./models/Technology.js";

// ── Reusable pieces ──────────────────────────────────────────────────

const eraEnum = z.enum(ERAS).optional();
const categoryEnum = z.enum(CATEGORIES).optional();

const positiveInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "");
      return Number.isNaN(n) || n < 1 ? fallback : n;
    });

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");

// ── Route schemas ────────────────────────────────────────────────────

export const technologiesQuery = z.object({
  era: eraEnum,
  category: categoryEnum,
  search: z.string().max(200).optional(),
  page: positiveInt(1),
  limit: positiveInt(50).transform((n) => Math.min(n, 200)),
});

export const technologyIdParam = z.object({
  id: objectId,
});

export const graphQuery = z.object({
  era: eraEnum,
  category: categoryEnum,
});

export const personNameParam = z.object({
  name: z.string().min(1, "Name is required"),
});

export const personsSearchQuery = z.object({
  search: z.string().max(200).optional(),
  limit: positiveInt(20).transform((n) => Math.min(n, 50)),
});

// ── Middleware factory ───────────────────────────────────────────────

type ReqPart = "query" | "params";

export function validate(schema: ZodSchema, source: ReqPart = "query") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }
    // Replace with parsed (and transformed) values
    (req as any)[source] = result.data;
    next();
  };
}
