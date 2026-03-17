import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

// Helper to get fresh state and actions
const getState = () => useAppStore.getState();
const act = useAppStore.getState;

beforeEach(() => {
  // Reset store to initial state between tests
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

describe("useAppStore", () => {
  describe("initial state", () => {
    it("has correct defaults", () => {
      const s = getState();
      expect(s.filters).toEqual({ era: "", category: "" });
      expect(s.colorBy).toBe("era");
      expect(s.searchTerm).toBe("");
      expect(s.selectedId).toBeNull();
      expect(s.selectedPerson).toBeNull();
      expect(s.viewMode).toBe("technology");
      expect(s.sidebarOpen).toBe(false);
    });
  });

  describe("setFilters", () => {
    it("updates filters and clears selection + sidebar", () => {
      useAppStore.setState({ selectedId: "abc", selectedPerson: "Newton", sidebarOpen: true });
      getState().setFilters({ era: "Ancient", category: "" });

      const s = getState();
      expect(s.filters).toEqual({ era: "Ancient", category: "" });
      expect(s.selectedId).toBeNull();
      expect(s.selectedPerson).toBeNull();
      expect(s.sidebarOpen).toBe(false);
    });
  });

  describe("setColorBy", () => {
    it("updates colorBy", () => {
      getState().setColorBy("category");
      expect(getState().colorBy).toBe("category");
    });
  });

  describe("setSearchTerm", () => {
    it("updates searchTerm", () => {
      getState().setSearchTerm("fire");
      expect(getState().searchTerm).toBe("fire");
    });
  });

  describe("setViewMode", () => {
    it("switches mode and clears selection + search", () => {
      useAppStore.setState({ selectedId: "abc", selectedPerson: "Newton", searchTerm: "calc" });
      getState().setViewMode("person");

      const s = getState();
      expect(s.viewMode).toBe("person");
      expect(s.selectedId).toBeNull();
      expect(s.selectedPerson).toBeNull();
      expect(s.searchTerm).toBe("");
    });
  });

  describe("toggleSidebar", () => {
    it("toggles sidebar open/closed", () => {
      expect(getState().sidebarOpen).toBe(false);
      getState().toggleSidebar();
      expect(getState().sidebarOpen).toBe(true);
      getState().toggleSidebar();
      expect(getState().sidebarOpen).toBe(false);
    });
  });

  describe("closeSidebar", () => {
    it("closes sidebar", () => {
      useAppStore.setState({ sidebarOpen: true });
      getState().closeSidebar();
      expect(getState().sidebarOpen).toBe(false);
    });
  });

  describe("selectNode", () => {
    it("selects a tech node in technology mode", () => {
      getState().selectNode("tech-1");
      expect(getState().selectedId).toBe("tech-1");
      expect(getState().selectedPerson).toBeNull();
    });

    it("toggles off when selecting the same tech node", () => {
      getState().selectNode("tech-1");
      getState().selectNode("tech-1");
      expect(getState().selectedId).toBeNull();
    });

    it("selects a person node in person mode", () => {
      getState().setViewMode("person");
      getState().selectNode("Isaac Newton");
      expect(getState().selectedPerson).toBe("Isaac Newton");
      expect(getState().selectedId).toBeNull();
    });

    it("toggles off when selecting the same person node", () => {
      getState().setViewMode("person");
      getState().selectNode("Isaac Newton");
      getState().selectNode("Isaac Newton");
      expect(getState().selectedPerson).toBeNull();
    });

    it("closes sidebar on select", () => {
      useAppStore.setState({ sidebarOpen: true });
      getState().selectNode("tech-1");
      expect(getState().sidebarOpen).toBe(false);
    });
  });

  describe("selectPerson", () => {
    it("sets selectedPerson", () => {
      getState().selectPerson("Newton");
      expect(getState().selectedPerson).toBe("Newton");
    });
  });

  describe("navigateToTech", () => {
    it("sets selectedId and clears selectedPerson", () => {
      useAppStore.setState({ selectedPerson: "Newton" });
      getState().navigateToTech("tech-99");
      expect(getState().selectedId).toBe("tech-99");
      expect(getState().selectedPerson).toBeNull();
    });
  });

  describe("clearSelection", () => {
    it("clears both selectedId and selectedPerson", () => {
      useAppStore.setState({ selectedId: "abc", selectedPerson: "Newton" });
      getState().clearSelection();
      expect(getState().selectedId).toBeNull();
      expect(getState().selectedPerson).toBeNull();
    });
  });

  describe("clearPerson", () => {
    it("clears only selectedPerson", () => {
      useAppStore.setState({ selectedId: "abc", selectedPerson: "Newton" });
      getState().clearPerson();
      expect(getState().selectedPerson).toBeNull();
      expect(getState().selectedId).toBe("abc");
    });
  });

  describe("closeDetail", () => {
    it("clears both selections", () => {
      useAppStore.setState({ selectedId: "abc", selectedPerson: "Newton" });
      getState().closeDetail();
      expect(getState().selectedId).toBeNull();
      expect(getState().selectedPerson).toBeNull();
    });
  });
});
