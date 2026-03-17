import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphTooltip from "./GraphTooltip";
import type { TechNode, PersonNode } from "../../types";

const techNode: TechNode = {
  _id: "1",
  name: "Fire",
  year: -400000,
  yearDisplay: "400000 BCE",
  era: "Prehistoric",
  category: "Energy",
};

const personNode: PersonNode = {
  _id: "newton",
  name: "Isaac Newton",
  year: 1687,
  yearDisplay: "1687 CE",
  era: "Early Modern",
  category: "Mathematics",
  contributionCount: 3,
};

const getColor = () => "#ff0000";

describe("GraphTooltip", () => {
  it("renders tech node info", () => {
    render(
      <GraphTooltip
        tooltip={{ x: 100, y: 200, node: techNode }}
        getColor={getColor}
      />,
    );
    expect(screen.getByText("Fire")).toBeInTheDocument();
    expect(screen.getByText("400000 BCE · Prehistoric")).toBeInTheDocument();
    expect(screen.getByText("Energy")).toBeInTheDocument();
  });

  it("renders person node with contribution count", () => {
    render(
      <GraphTooltip
        tooltip={{ x: 100, y: 200, node: personNode }}
        getColor={getColor}
      />,
    );
    expect(screen.getByText("Isaac Newton")).toBeInTheDocument();
    expect(screen.getByText("1687 CE · Early Modern")).toBeInTheDocument();
    expect(
      screen.getByText("Mathematics · 3 contributions"),
    ).toBeInTheDocument();
  });

  it("applies color from getColor", () => {
    render(
      <GraphTooltip
        tooltip={{ x: 100, y: 200, node: techNode }}
        getColor={getColor}
      />,
    );
    const nameEl = screen.getByText("Fire");
    expect(nameEl).toHaveStyle({ color: "#ff0000" });
  });
});
