import { useState, useEffect, useRef } from 'react'
import { useStats } from '../../hooks/useGraphData'
import { useAppStore } from '../../store/useAppStore'
import {
  ERA_COLORS,
  CATEGORY_COLORS,
  ERAS,
  CATEGORIES,
  API_BASE,
} from '../../utils/constants'
import type {
  Era,
  Category,
  SearchResultTech,
  SearchResultPerson,
} from '../../types'

const FALLBACK_COLOR = '#666'

type SearchResult = SearchResultTech | SearchResultPerson

interface SidebarProps {
  nodeCount: number
  edgeCount: number
  loading: boolean
}

export default function Sidebar({ nodeCount, edgeCount, loading }: SidebarProps) {
  const filters = useAppStore((s) => s.filters)
  const colorBy = useAppStore((s) => s.colorBy)
  const searchTerm = useAppStore((s) => s.searchTerm)
  const viewMode = useAppStore((s) => s.viewMode)
  const isOpen = useAppStore((s) => s.sidebarOpen)
  const closeSidebar = useAppStore((s) => s.closeSidebar)
  const setFilters = useAppStore((s) => s.setFilters)
  const setColorBy = useAppStore((s) => s.setColorBy)
  const setSearchTerm = useAppStore((s) => s.setSearchTerm)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const selectNode = useAppStore((s) => s.selectNode)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const recentlyViewed = useAppStore((s) => s.recentlyViewed)
  const navigateToTech = useAppStore((s) => s.navigateToTech)
  const clearRecent = useAppStore((s) => s.clearRecent)

  const { stats } = useStats()
  const eras = stats?.eras || ERAS
  const categories = stats?.categories || CATEGORIES

  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (searchTerm.length < 3) {
      setSearchResults([])
      setActiveIdx(-1)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ search: searchTerm, limit: '20' })
        const url = viewMode === 'person'
          ? `${API_BASE}/persons-search?${params}`
          : `${API_BASE}/technologies?${params}`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(viewMode === 'person' ? data.persons : data.technologies)
        }
      } catch {
        // silently fail — graph highlighting still works
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchTerm, viewMode])

  const handleEra = (era: Era) => {
    setFilters({ ...filters, era: filters.era === era ? '' : era })
  }
  const handleCategory = (cat: Category) => {
    setFilters({ ...filters, category: filters.category === cat ? '' : cat })
  }
  const clearAll = () => {
    setFilters({ era: '', category: '' })
    setSearchTerm('')
  }

  const handleResultClick = (item: SearchResult) => {
    if (viewMode === 'person') {
      selectPerson(item.name)
    } else {
      selectNode((item as SearchResultTech)._id)
    }
    setSearchResults([])
    setSearchTerm('')
    setActiveIdx(-1)
    // Dismiss soft keyboard on mobile
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!searchResults.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i < searchResults.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i > 0 ? i - 1 : searchResults.length - 1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleResultClick(searchResults[activeIdx])
    } else if (e.key === 'Escape') {
      setSearchResults([])
      setActiveIdx(-1)
    }
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <h1 className="logo">
            tech<span className="logo-accent">Relative</span>
          </h1>
          <button
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>
        {nodeCount > 0 && (
          <div className="meta-counts">
            <span className="meta-count-highlight">
              {nodeCount.toLocaleString()}
            </span>{' '}
            {viewMode === 'person' ? 'persons' : 'nodes'} ·{' '}
            <span className="meta-count-highlight">
              {edgeCount.toLocaleString()}
            </span>{' '}
            edges
          </div>
        )}
      </div>

      <div className="sidebar-body">
      {/* View mode toggle */}
      <div className="filter-section">
        <label className="filter-label">View</label>
        <div className="toggle-group">
          {(['technology', 'person'] as const).map((v) => (
            <button
              key={v}
              className={`toggle-btn ${viewMode === v ? 'active' : ''}`}
              onClick={() => setViewMode(v)}
            >
              {v === 'technology' ? 'tech' : 'person'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="filter-section">
        <input
          type="text"
          className="search-input"
          placeholder={viewMode === 'person' ? 'Search persons…' : 'Search technologies…'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {searching && (
          <div className="search-status">Searching…</div>
        )}
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((item, i) => (
              <li key={viewMode === 'person' ? item.name : (item as SearchResultTech)._id}>
                <button
                  className={`search-result-item ${i === activeIdx ? 'active' : ''}`}
                  onClick={() => handleResultClick(item)}
                >
                  <span className="search-result-name">{item.name}</span>
                  <span className="search-result-meta">
                    {viewMode === 'person'
                      ? `${(item as SearchResultPerson).contributionCount} contributions · ${item.category}`
                      : `${(item as SearchResultTech).yearDisplay} · ${item.category}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Color by */}
      <div className="filter-section">
        <label className="filter-label">Color by</label>
        <div className="toggle-group">
          {(['era', 'category'] as const).map((v) => (
            <button
              key={v}
              className={`toggle-btn ${colorBy === v ? 'active' : ''}`}
              onClick={() => setColorBy(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Eras */}
      <div className="filter-section">
        <label className="filter-label">Era</label>
        <div className="chip-list">
          {eras.map((era) => (
            <button
              key={era}
              className={`chip ${filters.era === era ? 'active' : ''}`}
              onClick={() => handleEra(era)}
            >
              <span
                className="chip-dot"
                style={{ background: ERA_COLORS[era] || FALLBACK_COLOR }}
              />
              {era}
            </button>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="filter-section">
        <label className="filter-label">Category</label>
        <div className="chip-list">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`chip ${filters.category === cat ? 'active' : ''}`}
              onClick={() => handleCategory(cat)}
            >
              <span
                className="chip-dot"
                style={{ background: CATEGORY_COLORS[cat] || FALLBACK_COLOR }}
              />
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      {(filters.era || filters.category || searchTerm) && (
        <button className="clear-btn" onClick={clearAll}>
          Clear all filters
        </button>
      )}

      {recentlyViewed.length > 0 && (
        <div className="filter-section">
          <div className="recent-header">
            <label className="filter-label">Recently viewed</label>
            <button className="recent-clear" onClick={clearRecent}>
              clear
            </button>
          </div>
          <ul className="recent-list">
            {recentlyViewed.map((item) => (
              <li key={item.id}>
                <button
                  className="recent-item"
                  onClick={() => {
                    if (item.type === 'person') {
                      selectPerson(item.id)
                    } else {
                      navigateToTech(item.id)
                    }
                  }}
                >
                  <span className="recent-item-name">{item.name}</span>
                  <span className="recent-item-meta">
                    {item.yearDisplay} · {item.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && <div className="loading-indicator">Loading graph…</div>}

      <div className="sidebar-footer">
        <a
          href="https://github.com/meckgale/techRelative"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="View source on GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
      </div>
    </aside>
  )
}
