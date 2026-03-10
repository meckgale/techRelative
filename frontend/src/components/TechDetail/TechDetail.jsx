import { memo } from 'react'
import { useTechDetail } from '../../hooks/useGraphData'
import { ERA_COLORS, CATEGORY_COLORS } from '../../utils/constants'

function TechDetail({ techId, onClose, onNavigate }) {
  const { tech, loading } = useTechDetail(techId)

  if (!techId) return null

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>
        ✕
      </button>

      {loading && <div className="loading-indicator">Loading…</div>}

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

          <div className="detail-year">{tech.yearDisplay || tech.year}</div>

          {tech.description && (
            <p className="detail-desc">{tech.description}</p>
          )}

          {tech.civilization && (
            <div className="detail-field">
              <span className="detail-field-label">Civilization</span>
              {tech.civilization}
            </div>
          )}

          {tech.person && (
            <div className="detail-field">
              <span className="detail-field-label">Person</span>
              {tech.person}
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

          {tech.seeAlso?.length > 0 && (
            <div className="detail-section">
              <span className="detail-field-label">Related</span>
              <div className="related-list">
                {tech.seeAlso.map((rel) => (
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
