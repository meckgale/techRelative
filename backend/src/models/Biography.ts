import mongoose, { Schema, type InferSchemaType } from "mongoose";

const biographySchema = new Schema(
  {
    name: { type: String, required: true },
    birthPlace: { type: String, default: "" },
    birthYear: { type: String, default: "" },
    deathPlace: { type: String, default: "" },
    deathYear: { type: String, default: "" },
    text: { type: String, default: "" },
  },
  { timestamps: true }
);

biographySchema.index({ name: "text" });

export type BiographyDocument = InferSchemaType<typeof biographySchema>;
export const Biography = mongoose.model("Biography", biographySchema);
