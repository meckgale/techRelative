import {
  ERAS,
  CATEGORIES,
  ERA_COLORS,
  CATEGORY_COLORS,
} from '../../utils/constants'

export default function Sidebar({
  filters,
  onFilterChange,
  colorBy,
  onColorByChange,
  searchTerm,
  onSearchChange,
  nodeCount,
  edgeCount,
  loading,
}) {
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
