import { create } from 'zustand'
import type { Filters, ViewMode, ColorBy, RecentItem } from '../types'

const RECENT_KEY = 'techRelative:recentlyViewed'
const MAX_RECENT = 15

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items))
  } catch { /* quota exceeded — ignore */ }
}

interface AppState {
  // ── UI State ────────────────────────────────────────────────
  filters: Filters
  colorBy: ColorBy
  searchTerm: string
  selectedId: string | null
  selectedPerson: string | null
  viewMode: ViewMode
  sidebarOpen: boolean
  recentlyViewed: RecentItem[]

  // ── Actions ─────────────────────────────────────────────────
  setFilters: (filters: Filters) => void
  setColorBy: (colorBy: ColorBy) => void
  setSearchTerm: (term: string) => void
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  closeSidebar: () => void
  selectNode: (id: string) => void
  selectPerson: (name: string) => void
  navigateToTech: (id: string) => void
  clearSelection: () => void
  clearPerson: () => void
  closeDetail: () => void
  addRecent: (item: Omit<RecentItem, 'timestamp'>) => void
  clearRecent: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  filters: { era: '', category: '' },
  colorBy: 'era',
  searchTerm: '',
  selectedId: null,
  selectedPerson: null,
  viewMode: 'technology',
  sidebarOpen: false,
  recentlyViewed: loadRecent(),

  setFilters: (filters) => set({
    filters,
    selectedId: null,
    selectedPerson: null,
  }),

  setColorBy: (colorBy) => set({ colorBy }),

  setSearchTerm: (searchTerm) => set({ searchTerm }),

  setViewMode: (mode) => set({
    viewMode: mode,
    selectedId: null,
    selectedPerson: null,
    searchTerm: '',
  }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  closeSidebar: () => set({ sidebarOpen: false }),

  selectNode: (id) => {
    const { viewMode } = get()
    if (viewMode === 'person') {
      set((s) => ({
        selectedPerson: s.selectedPerson === id ? null : id,
        selectedId: null,
        sidebarOpen: false,
      }))
    } else {
      set((s) => ({
        selectedId: s.selectedId === id ? null : id,
        selectedPerson: null,
        sidebarOpen: false,
      }))
    }
  },

  selectPerson: (name) => set({ selectedPerson: name }),

  navigateToTech: (id) => set({
    selectedPerson: null,
    selectedId: id,
  }),

  clearSelection: () => set({
    selectedId: null,
    selectedPerson: null,
  }),

  clearPerson: () => set({ selectedPerson: null }),

  closeDetail: () => set({
    selectedId: null,
    selectedPerson: null,
  }),

  addRecent: (item) => {
    const { recentlyViewed } = get()
    const filtered = recentlyViewed.filter((r) => r.id !== item.id)
    const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT)
    saveRecent(updated)
    set({ recentlyViewed: updated })
  },

  clearRecent: () => {
    localStorage.removeItem(RECENT_KEY)
    set({ recentlyViewed: [] })
  },
}))

// Selector for the active selected ID (depends on viewMode)
export function useActiveSelectedId(): string | null {
  return useAppStore((s) =>
    s.viewMode === 'person' ? s.selectedPerson : s.selectedId,
  )
}
