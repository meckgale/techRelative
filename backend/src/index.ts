import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import app from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Backend running on :${PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
