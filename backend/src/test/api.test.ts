import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { seedTestData } from "./fixtures.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/technologies", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns paginated technologies sorted by year", async () => {
    const res = await request(app).get("/api/technologies");
    expect(res.status).toBe(200);
    expect(res.body.technologies).toHaveLength(5);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.pages).toBe(1);
    // Sorted by year ascending
    expect(res.body.technologies[0].name).toBe("Fire");
    expect(res.body.technologies[4].name).toBe("Analytical Engine");
  });

  it("filters by era", async () => {
    const res = await request(app).get("/api/technologies?era=Ancient");
    expect(res.status).toBe(200);
    expect(res.body.technologies).toHaveLength(1);
    expect(res.body.technologies[0].name).toBe("Wheel");
  });

  it("filters by category", async () => {
    const res = await request(app).get("/api/technologies?category=Energy");
    expect(res.status).toBe(200);
    expect(res.body.technologies).toHaveLength(1);
    expect(res.body.technologies[0].name).toBe("Fire");
  });

  it("respects page and limit params", async () => {
    const res = await request(app).get("/api/technologies?page=2&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.technologies).toHaveLength(2);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.pages).toBe(3);
    // Page 2 with limit 2: should be the 3rd and 4th techs by year
    expect(res.body.technologies[0].name).toBe("Calculus");
  });

  it("clamps limit to max 200", async () => {
    const res = await request(app).get("/api/technologies?limit=500");
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(200);
  });
});

describe("GET /api/technologies/:id", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns a technology with its relations", async () => {
    const listRes = await request(app).get("/api/technologies?category=Mathematics");
    const calculusId = listRes.body.technologies[0]._id;

    const res = await request(app).get(`/api/technologies/${calculusId}`);
    expect(res.status).toBe(200);
    expect(res.body.technology.name).toBe("Calculus");
    expect(res.body.relations.length).toBeGreaterThan(0);
    // Relations should have populated from/to objects
    expect(res.body.relations[0].from).toHaveProperty("name");
    expect(res.body.relations[0].to).toHaveProperty("name");
  });

  it("returns 404 for non-existent id", async () => {
    const fakeId = "000000000000000000000000";
    const res = await request(app).get(`/api/technologies/${fakeId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Technology not found");
  });
});

describe("GET /api/graph", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns nodes and edges with meta", async () => {
    const res = await request(app).get("/api/graph");
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(5);
    expect(res.body.edges).toHaveLength(2);
    expect(res.body.meta.nodeCount).toBe(5);
    expect(res.body.meta.edgeCount).toBe(2);
  });

  it("filters by era", async () => {
    const res = await request(app).get("/api/graph?era=Early Modern");
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(2);
    // Only the Calculus -> Classical Mechanics edge (both Early Modern)
    expect(res.body.edges).toHaveLength(1);
  });

  it("filters by category", async () => {
    const res = await request(app).get("/api/graph?category=Computers");
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
    expect(res.body.nodes[0].name).toBe("Analytical Engine");
    // No edges since the other end is not in the filtered set
    expect(res.body.edges).toHaveLength(0);
  });

  it("caches results", async () => {
    const res1 = await request(app).get("/api/graph");
    const res2 = await request(app).get("/api/graph");
    expect(res1.body).toEqual(res2.body);
  });
});

describe("GET /api/stats", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns counts and breakdowns", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.technologies).toBe(5);
    expect(res.body.relations).toBe(2);
    expect(res.body.byEra).toHaveProperty("Early Modern", 2);
    expect(res.body.byEra).toHaveProperty("Prehistoric", 1);
    expect(res.body.byCategory).toHaveProperty("Mathematics", 1);
    expect(res.body.eras).toBeInstanceOf(Array);
    expect(res.body.categories).toBeInstanceOf(Array);
  });
});

describe("GET /api/persons/:name", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns person profile with contributions", async () => {
    const res = await request(app).get("/api/persons/Isaac%20Newton");
    expect(res.status).toBe(200);
    expect(res.body.person.name).toBe("Isaac Newton");
    expect(res.body.person.contributionCount).toBe(2);
    expect(res.body.person.wikipediaUrl).toBe(
      "https://en.wikipedia.org/wiki/Isaac_Newton"
    );
    expect(res.body.person.thumbnailUrl).toBe(
      "https://example.com/newton.jpg"
    );
    expect(res.body.contributions).toHaveLength(2);
    expect(res.body.person.eras).toContain("Early Modern");
    expect(res.body.person.categories).toContain("Mathematics");
    expect(res.body.person.categories).toContain("Physics");
  });

  it("returns 404 for unknown person", async () => {
    const res = await request(app).get("/api/persons/Nobody");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Person not found");
  });
});

describe("GET /api/persons-graph", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns person nodes aggregated from technologies", async () => {
    const res = await request(app).get("/api/persons-graph");
    expect(res.status).toBe(200);
    // Isaac Newton (2 techs) and Charles Babbage (1 tech)
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.meta.nodeCount).toBe(2);

    const newton = res.body.nodes.find(
      (n: any) => n.name === "Isaac Newton"
    );
    expect(newton).toBeDefined();
    expect(newton.contributionCount).toBe(2);

    const babbage = res.body.nodes.find(
      (n: any) => n.name === "Charles Babbage"
    );
    expect(babbage).toBeDefined();
    expect(babbage.contributionCount).toBe(1);
  });

  it("derives person-to-person edges from tech relations", async () => {
    const res = await request(app).get("/api/persons-graph");
    // Classical Mechanics (Newton) -> Analytical Engine (Babbage) = 1 edge
    expect(res.body.edges).toHaveLength(1);
    const edge = res.body.edges[0];
    // Canonical ordering: "Charles Babbage" < "Isaac Newton"
    expect(edge.source).toBe("Charles Babbage");
    expect(edge.target).toBe("Isaac Newton");
    expect(edge.weight).toBe(1);
  });

  it("excludes self-edges", async () => {
    // Calculus -> Classical Mechanics are both Newton — no self-edge
    const res = await request(app).get("/api/persons-graph");
    const selfEdges = res.body.edges.filter(
      (e: any) => e.source === e.target
    );
    expect(selfEdges).toHaveLength(0);
  });
});

describe("GET /api/persons-search", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("returns matching persons by name", async () => {
    const res = await request(app).get("/api/persons-search?search=Newton");
    expect(res.status).toBe(200);
    expect(res.body.persons).toHaveLength(1);
    expect(res.body.persons[0].name).toBe("Isaac Newton");
    expect(res.body.persons[0].contributionCount).toBe(2);
  });

  it("returns empty array for short search queries", async () => {
    const res = await request(app).get("/api/persons-search?search=N");
    expect(res.status).toBe(200);
    expect(res.body.persons).toHaveLength(0);
  });

  it("returns empty array when no search param", async () => {
    const res = await request(app).get("/api/persons-search");
    expect(res.status).toBe(200);
    expect(res.body.persons).toHaveLength(0);
  });

  it("respects limit param", async () => {
    const res = await request(app).get(
      "/api/persons-search?search=a&limit=1"
    );
    expect(res.status).toBe(200);
    expect(res.body.persons.length).toBeLessThanOrEqual(1);
  });
});
