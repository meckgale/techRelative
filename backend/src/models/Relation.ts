import mongoose, { Schema, type InferSchemaType } from "mongoose";

const RELATION_TYPES = [
  "related_to",
  "led_to",
  "enabled",
  "improved",
  "required",
  "inspired",
] as const;

const relationSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: "Technology", required: true },
    to: { type: Schema.Types.ObjectId, ref: "Technology", required: true },
    type: { type: String, required: true, enum: RELATION_TYPES },
    fromYear: { type: Number },
    toYear: { type: Number },
  },
  { timestamps: true }
);

relationSchema.index({ from: 1 });
relationSchema.index({ to: 1 });
relationSchema.index({ from: 1, to: 1 }, { unique: true });
relationSchema.index({ type: 1 });

export type RelationDocument = InferSchemaType<typeof relationSchema>;
export const Relation = mongoose.model("Relation", relationSchema);
export { RELATION_TYPES };
