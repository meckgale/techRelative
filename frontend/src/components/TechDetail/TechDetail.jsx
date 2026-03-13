import { memo, useMemo, useEffect } from 'react'
import { useTechDetail } from '../../hooks/useGraphData'
import { ERA_COLORS, CATEGORY_COLORS } from '../../utils/constants'

function TechDetail({ techId, onClose, onNavigate, onPersonClick }) {
  const { tech, relations, loading, error } = useTechDetail(techId)

  // Extract unique neighbor technologies from relations
  const related = useMemo(() => {
    if (!techId || !relations.length) return []
    const seen = new Set()
    const result = []
    for (const r of relations) {
      const other = r.from?._id === techId ? r.to : r.from
      if (other && !seen.has(other._id)) {
        seen.add(other._id)
        result.push(other)
      }
    }
    return result
  }, [techId, relations])

  // Escape key closes the panel
  useEffect(() => {
    if (!techId) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [techId, onClose])

  if (!techId) return null

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>
        ✕
      </button>

      {loading && <div className="loading-indicator">Loading…</div>}
      {error && <div className="detail-error">Failed to load details</div>}

      {tech && (
        <>
          <h2 className="detail-name">{tech.name}</h2>

          <div className="detail-meta">
            <span
              className="detail-badge"
              style={{
                background: ERA_COLORS[tech.era] + '22',
                color: ERA_COLORS[tech.era],
              }}
            >
              {tech.era}
            </span>
            <span
              className="detail-badge"
              style={{
                background: CATEGORY_COLORS[tech.category] + '22',
                color: CATEGORY_COLORS[tech.category],
              }}
            >
              {tech.category}
            </span>
          </div>

          <div className="detail-year">{tech.yearDisplay}</div>

          {tech.description && (
            <p className="detail-desc">{tech.description}</p>
          )}

          {tech.region && (
            <div className="detail-field">
              <span className="detail-field-label">Region</span>
              {tech.region}
            </div>
          )}

          {tech.person && (
            <div className="detail-field">
              <span className="detail-field-label">Person</span>
              <button
                className="person-link"
                onClick={() => onPersonClick(tech.person)}
              >
                {tech.person}
              </button>
            </div>
          )}

          {tech.tags?.length > 0 && (
            <div className="detail-tags">
              {tech.tags.map((t) => (
                <span key={t} className="detail-tag">
                  {t}
                </span>
              ))}
            </div>
          )}

          {related.length > 0 && (
            <div className="detail-section">
              <span className="detail-field-label">Related</span>
              <div className="related-list">
                {related.map((rel) => (
                  <button
                    key={rel._id}
                    className="related-link"
                    onClick={() => onNavigate(rel._id)}
                  >
                    {rel.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default memo(TechDetail)
