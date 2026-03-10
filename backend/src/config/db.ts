import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const MONGO_URL =
  process.env.MONGO_URL || "mongodb://localhost:27017/techrelative";
  
  try {
    await mongoose.connect(MONGO_URL);
    console.log(`Connected to MongoDB: ${MONGO_URL}`);
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}
