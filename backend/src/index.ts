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

  const shutdown = () => {
    console.log("Shutting down gracefully...");

    // Force exit after 10s if connections won't drain
    const forceExit = setTimeout(() => {
      console.error("Forcing shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
