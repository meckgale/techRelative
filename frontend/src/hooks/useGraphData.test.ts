import { describe, it, expect } from "vitest";
import {
  detailReducer,
  detailInitial,
  personReducer,
  personInitial,
} from "./useGraphData";

describe("detailReducer", () => {
  it("sets loading state", () => {
    const state = detailReducer(detailInitial, { type: "loading" });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("sets success state with tech and relations", () => {
    const tech = {
      _id: "1",
      name: "Fire",
      year: -400000,
      yearDisplay: "400000 BCE",
      era: "Prehistoric" as const,
      category: "Energy" as const,
      tags: [],
      description: "Controlled use of fire",
      region: null,
      person: null,
    };
    const relations = [
      {
        from: { _id: "1", name: "Fire", year: -400000, yearDisplay: "400000 BCE", category: "Energy" as const },
        to: { _id: "2", name: "Wheel", year: -3500, yearDisplay: "3500 BCE", category: "Transportation" as const },
        type: "led_to" as const,
      },
    ];

    const state = detailReducer(
      { ...detailInitial, loading: true },
      { type: "success", tech, relations },
    );
    expect(state.loading).toBe(false);
    expect(state.tech).toEqual(tech);
    expect(state.relations).toEqual(relations);
    expect(state.error).toBeNull();
  });

  it("sets error state", () => {
    const state = detailReducer(
      { ...detailInitial, loading: true },
      { type: "error", error: "Network error" },
    );
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Network error");
  });

  it("clears error on new loading", () => {
    const errorState = detailReducer(detailInitial, {
      type: "error",
      error: "fail",
    });
    const state = detailReducer(errorState, { type: "loading" });
    expect(state.error).toBeNull();
    expect(state.loading).toBe(true);
  });
});

describe("personReducer", () => {
  it("sets loading state", () => {
    const state = personReducer(personInitial, { type: "loading" });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("sets success state with person and contributions", () => {
    const person = {
      name: "Isaac Newton",
      activeFrom: 1687,
      activeTo: 1687,
      eras: ["Early Modern" as const],
      categories: ["Mathematics" as const, "Physics" as const],
      regions: ["Europe"],
      tags: ["calculus"],
      contributionCount: 2,
      wikipediaUrl: null,
      thumbnailUrl: null,
    };
    const contributions = [
      {
        _id: "1",
        name: "Calculus",
        year: 1687,
        yearDisplay: "1687 CE",
        era: "Early Modern" as const,
        category: "Mathematics" as const,
        description: "Development of calculus",
      },
    ];

    const state = personReducer(
      { ...personInitial, loading: true },
      { type: "success", person, contributions },
    );
    expect(state.loading).toBe(false);
    expect(state.person).toEqual(person);
    expect(state.contributions).toEqual(contributions);
    expect(state.error).toBeNull();
  });

  it("sets error state", () => {
    const state = personReducer(
      { ...personInitial, loading: true },
      { type: "error", error: "404 Not Found" },
    );
    expect(state.loading).toBe(false);
    expect(state.error).toBe("404 Not Found");
  });

  it("clears error on new loading", () => {
    const errorState = personReducer(personInitial, {
      type: "error",
      error: "fail",
    });
    const state = personReducer(errorState, { type: "loading" });
    expect(state.error).toBeNull();
    expect(state.loading).toBe(true);
  });
});
