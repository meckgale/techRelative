import express from "express";
import cors from "cors";
import compression from "compression";
import responseTime from "response-time";
import rateLimit from "express-rate-limit";
import apiRoutes from "./routes/api.js";

const app = express();

app.use(cors());
app.use(compression());
app.use(responseTime());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use("/api", apiLimiter);
app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
