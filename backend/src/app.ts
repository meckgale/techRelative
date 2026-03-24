import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import responseTime from "response-time";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import apiRoutes from "./routes/api.js";

const app = express();

// Trust first proxy (Nginx) so req.ip reflects the real client IP
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS — restrict to known origin in production
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));

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

// Nginx proxy token validation (skipped if PROXY_TOKEN is not set)
const PROXY_TOKEN = process.env.PROXY_TOKEN;

function proxyAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!PROXY_TOKEN) return next();

  const provided = req.headers["x-proxy-token"];
  if (provided !== PROXY_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

app.use("/api", apiLimiter);
app.use("/api", proxyAuth);
app.use("/api", apiRoutes);

app.get("/health", async (_req, res) => {
  try {
    await mongoose.connection.db!.admin().ping();
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy", error: "Database unavailable" });
  }
});

export default app;
