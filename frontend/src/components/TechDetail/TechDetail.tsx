import { memo, useMemo, useEffect } from 'react'
import { useTechDetail } from '../../hooks/useGraphData'
import { useAppStore } from '../../store/useAppStore'
import { ERA_COLORS, CATEGORY_COLORS } from '../../utils/constants'
import type { Era, Category } from '../../types'

interface RelatedNode {
  _id: string
  name: string
}

function TechDetail() {
  const techId = useAppStore((s) => s.selectedId)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const selectNode = useAppStore((s) => s.selectNode)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const addRecent = useAppStore((s) => s.addRecent)

  const { tech, relations, loading, error, retry } = useTechDetail(techId)

  useEffect(() => {
    if (tech) {
      addRecent({
        id: tech._id,
        name: tech.name,
        yearDisplay: tech.yearDisplay,
        category: tech.category as Category,
        type: 'technology',
      })
    }
  }, [tech, addRecent])

  const related = useMemo(() => {
    if (!techId || !relations.length) return [] as RelatedNode[]
    const seen = new Set<string>()
    const result: RelatedNode[] = []
    for (const r of relations) {
      const other = r.from?._id === techId ? r.to : r.from
      if (other && !seen.has(other._id)) {
        seen.add(other._id)
        result.push(other)
      }
    }
    return result
  }, [techId, relations])

  useEffect(() => {
    if (!techId) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [techId, clearSelection])

  if (!techId) return null

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={clearSelection}>
        ✕
      </button>

      {loading && <div className="loading-indicator">Loading…</div>}
      {error && (
        <div className="detail-error">
          {error} <button className="retry-btn" onClick={retry}>Retry</button>
        </div>
      )}

      {tech && (
        <>
          <h2 className="detail-name">{tech.name}</h2>

          <div className="detail-meta">
            <span
              className="detail-badge"
              style={{
                background: ERA_COLORS[tech.era as Era] + '22',
                color: ERA_COLORS[tech.era as Era],
              }}
            >
              {tech.era}
            </span>
            <span
              className="detail-badge"
              style={{
                background: CATEGORY_COLORS[tech.category as Category] + '22',
                color: CATEGORY_COLORS[tech.category as Category],
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
                onClick={() => selectPerson(tech.person!)}
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
                    onClick={() => selectNode(rel._id)}
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
