import { useState, useEffect, useRef } from 'react'
import { useStats } from '../../hooks/useGraphData'
import {
  ERA_COLORS,
  CATEGORY_COLORS,
  API_BASE,
} from '../../utils/constants'

const DEFAULT_ERAS = Object.keys(ERA_COLORS)
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_COLORS)
const FALLBACK_COLOR = '#666'

export default function Sidebar({
  filters,
  onFilterChange,
  colorBy,
  onColorByChange,
  searchTerm,
  onSearchChange,
  onSelectTech,
  onSelectPerson,
  nodeCount,
  edgeCount,
  loading,
  viewMode = 'technology',
  onViewModeChange,
  isOpen = false,
}) {
  const stats = useStats()
  const eras = stats?.eras || DEFAULT_ERAS
  const categories = stats?.categories || DEFAULT_CATEGORIES

  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef(null)

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

    return () => clearTimeout(debounceRef.current)
  }, [searchTerm, viewMode])

  const handleEra = (era) => {
    onFilterChange({ ...filters, era: filters.era === era ? '' : era })
  }
  const handleCategory = (cat) => {
    onFilterChange({
      ...filters,
      category: filters.category === cat ? '' : cat,
    })
  }
  const clearAll = () => {
    onFilterChange({ era: '', category: '' })
    onSearchChange('')
  }

  const handleResultClick = (item) => {
    if (viewMode === 'person') {
      onSelectPerson(item.name)
    } else {
      onSelectTech(item._id)
    }
    setSearchResults([])
    onSearchChange('')
    setActiveIdx(-1)
  }

  const handleSearchKeyDown = (e) => {
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
          {['technology', 'person'].map((v) => (
            <button
              key={v}
              className={`toggle-btn ${viewMode === v ? 'active' : ''}`}
              onClick={() => onViewModeChange(v)}
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
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {searching && (
          <div className="search-status">Searching…</div>
        )}
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((item, i) => (
              <li key={viewMode === 'person' ? item.name : item._id}>
                <button
                  className={`search-result-item ${i === activeIdx ? 'active' : ''}`}
                  onClick={() => handleResultClick(item)}
                >
                  <span className="search-result-name">{item.name}</span>
                  <span className="search-result-meta">
                    {viewMode === 'person'
                      ? `${item.contributionCount} contributions · ${item.category}`
                      : `${item.yearDisplay} · ${item.category}`}
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
          {['era', 'category'].map((v) => (
            <button
              key={v}
              className={`toggle-btn ${colorBy === v ? 'active' : ''}`}
              onClick={() => onColorByChange(v)}
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
