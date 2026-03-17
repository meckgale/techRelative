import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TechDetail from "./TechDetail";
import { useAppStore } from "../../store/useAppStore";

const mockTech = {
  _id: "tech-1",
  name: "Calculus",
  year: 1687,
  yearDisplay: "1687 CE",
  era: "Early Modern",
  category: "Mathematics",
  tags: ["calculus", "analysis"],
  description: "Development of calculus",
  region: "Europe",
  person: "Isaac Newton",
};

const mockRelations = [
  {
    from: { _id: "tech-1", name: "Calculus", year: 1687, yearDisplay: "1687 CE", category: "Mathematics" },
    to: { _id: "tech-2", name: "Classical Mechanics", year: 1687, yearDisplay: "1687 CE", category: "Physics" },
    type: "enabled",
  },
];

// Mock the hook
vi.mock("../../hooks/useGraphData", () => ({
  useTechDetail: vi.fn(),
}));

import { useTechDetail } from "../../hooks/useGraphData";
const mockUseTechDetail = vi.mocked(useTechDetail);

beforeEach(() => {
  useAppStore.setState({
    selectedId: null,
    selectedPerson: null,
    viewMode: "technology",
  });
  mockUseTechDetail.mockReturnValue({
    tech: null,
    relations: [],
    loading: false,
    error: null,
  });
});

describe("TechDetail", () => {
  it("renders nothing when no tech is selected", () => {
    const { container } = render(<TechDetail />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: null,
      relations: [],
      loading: true,
      error: null,
    });

    render(<TechDetail />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error state", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: null,
      relations: [],
      loading: false,
      error: "Network error",
    });

    render(<TechDetail />);
    expect(screen.getByText("Failed to load details")).toBeInTheDocument();
  });

  it("renders tech details", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: mockRelations,
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    expect(screen.getByText("Calculus")).toBeInTheDocument();
    expect(screen.getByText("1687 CE")).toBeInTheDocument();
    expect(screen.getByText("Early Modern")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Development of calculus")).toBeInTheDocument();
    expect(screen.getByText("Europe")).toBeInTheDocument();
    expect(screen.getByText("Isaac Newton")).toBeInTheDocument();
    expect(screen.getByText("calculus")).toBeInTheDocument();
    expect(screen.getByText("analysis")).toBeInTheDocument();
  });

  it("renders related technologies", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: mockRelations,
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    expect(screen.getByText("Classical Mechanics")).toBeInTheDocument();
  });

  it("navigates to related tech on click", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: mockRelations,
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    fireEvent.click(screen.getByText("Classical Mechanics"));

    const state = useAppStore.getState();
    expect(state.selectedId).toBe("tech-2");
    expect(state.selectedPerson).toBeNull();
  });

  it("navigates to person on click", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: [],
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    fireEvent.click(screen.getByText("Isaac Newton"));

    expect(useAppStore.getState().selectedPerson).toBe("Isaac Newton");
  });

  it("closes on close button click", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: [],
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    fireEvent.click(screen.getByText("✕"));

    expect(useAppStore.getState().selectedId).toBeNull();
  });

  it("closes on Escape key", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: mockTech,
      relations: [],
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(useAppStore.getState().selectedId).toBeNull();
  });

  it("hides optional fields when absent", () => {
    useAppStore.setState({ selectedId: "tech-1" });
    mockUseTechDetail.mockReturnValue({
      tech: { ...mockTech, description: "", region: null, person: null, tags: [] },
      relations: [],
      loading: false,
      error: null,
    });

    render(<TechDetail />);
    expect(screen.getByText("Calculus")).toBeInTheDocument();
    expect(screen.queryByText("Region")).not.toBeInTheDocument();
    expect(screen.queryByText("Person")).not.toBeInTheDocument();
  });
});
