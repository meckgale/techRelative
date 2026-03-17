import express from "express";
import cors from "cors";
import compression from "compression";
import responseTime from "response-time";
import apiRoutes from "./routes/api.js";

const app = express();

app.use(cors());
app.use(compression());
app.use(responseTime());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
