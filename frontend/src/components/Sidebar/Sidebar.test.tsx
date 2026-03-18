import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { useAppStore } from "../../store/useAppStore";

// Mock useStats to avoid API calls
vi.mock("../../hooks/useGraphData", () => ({
  useStats: vi.fn(() => ({ stats: null, error: null })),
}));

beforeEach(() => {
  useAppStore.setState({
    filters: { era: "", category: "" },
    colorBy: "era",
    searchTerm: "",
    selectedId: null,
    selectedPerson: null,
    viewMode: "technology",
    sidebarOpen: false,
  });
});

describe("Sidebar", () => {
  it("renders logo and counts", () => {
    render(<Sidebar nodeCount={150} edgeCount={300} loading={false} />);
    expect(screen.getByText("Relative")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("hides counts when nodeCount is 0", () => {
    render(<Sidebar nodeCount={0} edgeCount={0} loading={false} />);
    expect(screen.queryByText("nodes")).not.toBeInTheDocument();
  });

  it("shows loading indicator", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={true} />);
    expect(screen.getByText("Loading graph…")).toBeInTheDocument();
  });

  it("renders view mode toggle buttons", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    // "tech" appears in logo and toggle — use role to target the button
    const toggleButtons = screen.getAllByRole("button");
    const techBtn = toggleButtons.find((b) => b.textContent === "tech");
    const personBtn = toggleButtons.find((b) => b.textContent === "person");
    expect(techBtn).toBeDefined();
    expect(personBtn).toBeDefined();
  });

  it("switches view mode on toggle click", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    fireEvent.click(screen.getByText("person"));
    expect(useAppStore.getState().viewMode).toBe("person");
  });

  it("shows 'persons' label in person mode", () => {
    useAppStore.setState({ viewMode: "person" });
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(screen.getByText(/persons/)).toBeInTheDocument();
  });

  it("renders era filter chips", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(screen.getByText("Prehistoric")).toBeInTheDocument();
    expect(screen.getByText("Ancient")).toBeInTheDocument();
    expect(screen.getByText("Information")).toBeInTheDocument();
  });

  it("toggles era filter on chip click", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    fireEvent.click(screen.getByText("Ancient"));
    expect(useAppStore.getState().filters.era).toBe("Ancient");

    // Click again to deselect
    fireEvent.click(screen.getByText("Ancient"));
    expect(useAppStore.getState().filters.era).toBe("");
  });

  it("renders category filter chips", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(screen.getByText("Computers")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Energy")).toBeInTheDocument();
  });

  it("toggles category filter on chip click", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    fireEvent.click(screen.getByText("Computers"));
    expect(useAppStore.getState().filters.category).toBe("Computers");
  });

  it("renders color-by toggle", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    const eraBtn = screen.getAllByText("era")[0];
    const catBtn = screen.getAllByText("category")[0];
    expect(eraBtn).toBeInTheDocument();
    expect(catBtn).toBeInTheDocument();
  });

  it("switches color-by on toggle click", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    // There are multiple "category" elements (toggle + chips); the toggle is first
    const catToggle = screen.getAllByText("category")[0];
    fireEvent.click(catToggle);
    expect(useAppStore.getState().colorBy).toBe("category");
  });

  it("shows clear button when filters are active", () => {
    useAppStore.setState({ filters: { era: "Ancient", category: "" } });
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(screen.getByText("Clear all filters")).toBeInTheDocument();
  });

  it("hides clear button when no filters", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(screen.queryByText("Clear all filters")).not.toBeInTheDocument();
  });

  it("clears all filters on clear button click", () => {
    useAppStore.setState({
      filters: { era: "Ancient", category: "Computers" },
      searchTerm: "fire",
    });
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    fireEvent.click(screen.getByText("Clear all filters"));

    const state = useAppStore.getState();
    expect(state.filters).toEqual({ era: "", category: "" });
    expect(state.searchTerm).toBe("");
  });

  it("renders search input with correct placeholder", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(
      screen.getByPlaceholderText("Search technologies…"),
    ).toBeInTheDocument();
  });

  it("shows person search placeholder in person mode", () => {
    useAppStore.setState({ viewMode: "person" });
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    expect(
      screen.getByPlaceholderText("Search persons…"),
    ).toBeInTheDocument();
  });

  it("updates search term on input", () => {
    render(<Sidebar nodeCount={10} edgeCount={5} loading={false} />);
    const input = screen.getByPlaceholderText("Search technologies…");
    fireEvent.change(input, { target: { value: "wheel" } });
    expect(useAppStore.getState().searchTerm).toBe("wheel");
  });
});
