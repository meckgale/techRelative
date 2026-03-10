import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import apiRoutes from "./routes/api.js";
import compression from 'compression';
import responseTime from 'response-time';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(compression());
app.use(responseTime());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on :${PORT}`);
  });
});
