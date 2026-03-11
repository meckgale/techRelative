import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ERAS = [
  "Prehistoric",
  "Neolithic",
  "Ancient",
  "Classical",
  "Medieval",
  "Early Modern",
  "Industrial",
  "Modern",
  "Information",
] as const;

const CATEGORIES = [
  "Anthropology",
  "Archaeology",
  "Astronomy",
  "Biology",
  "Chemistry",
  "Communication",
  "Computers",
  "Construction",
  "Earth science",
  "Ecology & the environment",
  "Electronics",
  "Energy",
  "Food & agriculture",
  "Materials",
  "Mathematics",
  "Medicine & health",
  "Physics",
  "Tools",
  "Transportation",
] as const;

const technologySchema = new Schema(
  {
    name: { type: String, required: true },
    year: { type: Number, required: true, index: true },
    yearDisplay: { type: String, required: true },
    era: { type: String, required: true, enum: ERAS, index: true },
    category: { type: String, required: true, enum: CATEGORIES, index: true },
    tags: { type: [String], default: [] },
    description: { type: String, default: "" },
    civilization: { type: String, default: null },
    person: { type: String, default: null },
  },
  { timestamps: true }
);

// Compound index for common query patterns
technologySchema.index({ era: 1, category: 1 });
technologySchema.index({ name: "text", description: "text" });

export type TechnologyDocument = InferSchemaType<typeof technologySchema>;
export const Technology = mongoose.model("Technology", technologySchema);
export { ERAS, CATEGORIES };
