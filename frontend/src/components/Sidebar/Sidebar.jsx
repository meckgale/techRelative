import { useState, useEffect, useRef } from 'react'
import {
  ERAS,
  CATEGORIES,
  ERA_COLORS,
  CATEGORY_COLORS,
  API_BASE,
} from '../../utils/constants'

export default function Sidebar({
  filters,
  onFilterChange,
  colorBy,
  onColorByChange,
  searchTerm,
  onSearchChange,
  onSelectTech,
  nodeCount,
  edgeCount,
  loading,
}) {
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (searchTerm.length < 3) {
      setSearchResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ search: searchTerm, limit: '20' })
        const res = await fetch(`${API_BASE}/technologies?${params}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.technologies)
        }
      } catch {
        // silently fail — graph highlighting still works
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [searchTerm])

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

  const handleResultClick = (tech) => {
    onSelectTech(tech._id)
    setSearchResults([])
    onSearchChange('')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">
          tech<span className="logo-accent">Relative</span>
        </h1>
        {nodeCount > 0 && (
          <div className="meta-counts">
            <span className="meta-count-highlight">
              {nodeCount.toLocaleString()}
            </span>{' '}
            nodes ·{' '}
            <span className="meta-count-highlight">
              {edgeCount.toLocaleString()}
            </span>{' '}
            edges
          </div>
        )}
      </div>

      {/* Search */}
      <div className="filter-section">
        <input
          type="text"
          className="search-input"
          placeholder="Search technologies…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searching && (
          <div className="search-status">Searching…</div>
        )}
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((tech) => (
              <li key={tech._id}>
                <button
                  className="search-result-item"
                  onClick={() => handleResultClick(tech)}
                >
                  <span className="search-result-name">{tech.name}</span>
                  <span className="search-result-meta">
                    {tech.yearDisplay} · {tech.category}
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
          {ERAS.map((era) => (
            <button
              key={era}
              className={`chip ${filters.era === era ? 'active' : ''}`}
              onClick={() => handleEra(era)}
            >
              <span
                className="chip-dot"
                style={{ background: ERA_COLORS[era] }}
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
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`chip ${filters.category === cat ? 'active' : ''}`}
              onClick={() => handleCategory(cat)}
            >
              <span
                className="chip-dot"
                style={{ background: CATEGORY_COLORS[cat] }}
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
