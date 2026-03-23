import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PersonDetail from "./PersonDetail";
import { useAppStore } from "../../store/useAppStore";

const mockPerson = {
  name: "Isaac Newton",
  activeFrom: 1665,
  activeTo: 1687,
  eras: ["Early Modern" as const],
  categories: ["Mathematics" as const, "Physics" as const],
  tags: ["calculus", "mechanics"],
  contributionCount: 2,
  wikipediaUrl: "https://en.wikipedia.org/wiki/Isaac_Newton",
  thumbnailUrl: "https://example.com/newton.jpg",
};

const mockContributions = [
  {
    _id: "tech-1",
    name: "Calculus",
    year: 1665,
    yearDisplay: "1665 CE",
    era: "Early Modern" as const,
    category: "Mathematics" as const,
    description: "Development of calculus",
  },
  {
    _id: "tech-2",
    name: "Classical Mechanics",
    year: 1687,
    yearDisplay: "1687 CE",
    era: "Early Modern" as const,
    category: "Physics" as const,
    description: "Laws of motion",
  },
];

vi.mock("../../hooks/useGraphData", () => ({
  usePersonDetail: vi.fn(),
}));

import { usePersonDetail } from "../../hooks/useGraphData";
const mockUsePersonDetail = vi.mocked(usePersonDetail);

beforeEach(() => {
  useAppStore.setState({
    selectedId: null,
    selectedPerson: null,
    viewMode: "person",
  });
  mockUsePersonDetail.mockReturnValue({
    person: null,
    contributions: [],
    loading: false,
    error: null,
    retry: vi.fn(),
  });
});

describe("PersonDetail", () => {
  it("renders nothing when no person is selected", () => {
    const { container } = render(<PersonDetail onBack={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: null,
      contributions: [],
      loading: true,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error state", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: null,
      contributions: [],
      loading: false,
      error: "Request failed",
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders person details", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: mockContributions,
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.getByText("Isaac Newton")).toBeInTheDocument();
    expect(screen.getByText("1665 CE – 1687 CE")).toBeInTheDocument();
    expect(screen.getByText("Early Modern")).toBeInTheDocument();
    // "Mathematics" and "Physics" appear in both badges and contribution list
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Physics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("calculus")).toBeInTheDocument();
    expect(screen.getByText("mechanics")).toBeInTheDocument();
    expect(screen.getByText("Contributions (2)")).toBeInTheDocument();
    expect(screen.getByText("Calculus")).toBeInTheDocument();
    expect(screen.getByText("Classical Mechanics")).toBeInTheDocument();
  });

  it("renders wikipedia link", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    const link = screen.getByText("Wikipedia →");
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Isaac_Newton",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders thumbnail image", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    const img = screen.getByAltText("Isaac Newton");
    expect(img).toHaveAttribute("src", "https://example.com/newton.jpg");
  });

  it("hides optional fields when absent", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: {
        ...mockPerson,
        tags: [],
        wikipediaUrl: null,
        thumbnailUrl: null,
      },
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.queryByText("Region")).not.toBeInTheDocument();
    expect(screen.queryByText("Wikipedia →")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Isaac Newton")).not.toBeInTheDocument();
  });

  it("navigates to contribution on click", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: mockContributions,
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    fireEvent.click(screen.getByText("Calculus"));

    const state = useAppStore.getState();
    expect(state.selectedId).toBe("tech-1");
    expect(state.selectedPerson).toBeNull();
  });

  it("closes on close button click", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    fireEvent.click(screen.getByText("✕"));

    expect(useAppStore.getState().selectedPerson).toBeNull();
  });

  it("closes on Escape key", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(useAppStore.getState().selectedPerson).toBeNull();
  });

  it("shows back button when onBack is true", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={true} />);
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });

  it("hides back button when onBack is false", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.queryByText("← Back")).not.toBeInTheDocument();
  });

  it("calls clearPerson on back button click", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton", selectedId: "tech-1" });
    mockUsePersonDetail.mockReturnValue({
      person: mockPerson,
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={true} />);
    fireEvent.click(screen.getByText("← Back"));

    const state = useAppStore.getState();
    expect(state.selectedPerson).toBeNull();
    // selectedId should remain
    expect(state.selectedId).toBe("tech-1");
  });

  it("shows single year when activeFrom equals activeTo", () => {
    useAppStore.setState({ selectedPerson: "Isaac Newton" });
    mockUsePersonDetail.mockReturnValue({
      person: { ...mockPerson, activeFrom: 1687, activeTo: 1687 },
      contributions: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    });

    render(<PersonDetail onBack={false} />);
    expect(screen.getByText("1687 CE")).toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });
});
