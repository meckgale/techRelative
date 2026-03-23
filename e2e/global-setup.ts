import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

async function waitForPort(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}`).catch(() => null);
      if (res) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} not ready after ${timeout}ms`);
}

export default async function globalSetup() {
  console.log("[e2e] Starting MongoMemoryServer...");
  const mongoServer = await MongoMemoryServer.create({
    instance: { port: 27018 },
  });
  const uri = mongoServer.getUri();
  console.log("[e2e] MongoMemoryServer started:", uri);

  // Seed the database
  console.log("[e2e] Seeding database...");
  await mongoose.connect(uri);
  await seedData();
  await mongoose.disconnect();
  console.log("[e2e] Database seeded.");

  // Start backend
  console.log("[e2e] Starting backend...");
  const backend = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: resolve(rootDir, "backend"),
    env: { ...process.env, MONGO_URL: uri, PORT: "3001" },
    stdio: "pipe",
    shell: true,
    detached: true,
  });
  backend.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backend.stderr?.on("data", (d) => process.stderr.write(`[backend:err] ${d}`));

  // Start frontend
  console.log("[e2e] Starting frontend...");
  const frontend = spawn("npx", ["vite", "--port", "3000"], {
    cwd: resolve(rootDir, "frontend"),
    env: { ...process.env },
    stdio: "pipe",
    shell: true,
    detached: true,
  });
  frontend.stdout?.on("data", (d) => process.stdout.write(`[frontend] ${d}`));
  frontend.stderr?.on("data", (d) => process.stderr.write(`[frontend:err] ${d}`));

  // Wait for both servers
  console.log("[e2e] Waiting for servers...");
  await waitForPort(3001);
  console.log("[e2e] Backend ready.");
  await waitForPort(3000);
  console.log("[e2e] Frontend ready.");

  // Store for teardown
  (globalThis as any).__E2E__ = { mongoServer, backend, frontend };
}

async function seedData() {
  const Technology = mongoose.model(
    "Technology",
    new mongoose.Schema({
      name: { type: String, required: true },
      year: { type: Number, required: true, index: true },
      yearDisplay: { type: String, required: true },
      era: { type: String, required: true, index: true },
      category: { type: String, required: true, index: true },
      tags: { type: [String], default: [] },
      description: { type: String, default: "" },
      region: { type: String, default: null },
      person: { type: String, default: null },
    }),
  );

  const Relation = mongoose.model(
    "Relation",
    new mongoose.Schema({
      from: { type: mongoose.Schema.Types.ObjectId, ref: "Technology", required: true },
      to: { type: mongoose.Schema.Types.ObjectId, ref: "Technology", required: true },
      type: { type: String, required: true },
      fromYear: { type: Number },
      toYear: { type: Number },
    }),
  );

  const Person = mongoose.model(
    "Person",
    new mongoose.Schema({
      name: { type: String, required: true, unique: true },
      wikipediaUrl: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
    }),
  );

  await Technology.collection.createIndex({ name: "text", description: "text" });

  const techs = await Technology.insertMany([
    {
      name: "Fire",
      year: -400000,
      yearDisplay: "400000 BCE",
      era: "Prehistoric",
      category: "Energy",
      tags: ["fire", "heat"],
      description: "Controlled use of fire",
      region: "Africa",
      person: null,
    },
    {
      name: "Wheel",
      year: -3500,
      yearDisplay: "3500 BCE",
      era: "Ancient",
      category: "Transportation",
      tags: ["wheel", "movement"],
      description: "Invention of the wheel",
      region: "Mesopotamia",
      person: null,
    },
    {
      name: "Calculus",
      year: 1687,
      yearDisplay: "1687 CE",
      era: "Early Modern",
      category: "Mathematics",
      tags: ["calculus", "analysis"],
      description: "Development of calculus",
      region: "Europe",
      person: "Isaac Newton",
    },
    {
      name: "Classical Mechanics",
      year: 1687,
      yearDisplay: "1687 CE",
      era: "Early Modern",
      category: "Physics",
      tags: ["mechanics", "physics"],
      description: "Laws of motion and gravitation",
      region: "Europe",
      person: "Isaac Newton",
    },
    {
      name: "Analytical Engine",
      year: 1837,
      yearDisplay: "1837 CE",
      era: "Industrial",
      category: "Computers",
      tags: ["computing"],
      description: "Proposed mechanical general-purpose computer",
      region: "Europe",
      person: "Charles Babbage",
    },
  ]);

  await Relation.insertMany([
    {
      from: techs[2]._id,
      to: techs[3]._id,
      type: "enabled",
      fromYear: 1687,
      toYear: 1687,
    },
    {
      from: techs[3]._id,
      to: techs[4]._id,
      type: "inspired",
      fromYear: 1687,
      toYear: 1837,
    },
  ]);

  await Person.create({
    name: "Isaac Newton",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Isaac_Newton",
    thumbnailUrl: "https://example.com/newton.jpg",
  });
}
