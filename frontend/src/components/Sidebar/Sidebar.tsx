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
  const setFilters = useAppStore((s) => s.setFilters)
  const setColorBy = useAppStore((s) => s.setColorBy)
  const setSearchTerm = useAppStore((s) => s.setSearchTerm)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const selectNode = useAppStore((s) => s.selectNode)
  const selectPerson = useAppStore((s) => s.selectPerson)

  const stats = useStats()
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
        <h1 className="logo">
          tech<span className="logo-accent">Relative</span>
        </h1>
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

      {loading && <div className="loading-indicator">Loading graph…</div>}
    </aside>
  )
}
