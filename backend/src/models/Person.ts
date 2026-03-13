import mongoose, { Schema, type InferSchemaType } from "mongoose";

const personSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    wikipediaUrl: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
  },
  { timestamps: true }
);

export type PersonDocument = InferSchemaType<typeof personSchema>;
export const Person = mongoose.model("Person", personSchema);
