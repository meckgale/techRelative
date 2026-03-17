import { memo, useEffect } from 'react'
import { usePersonDetail } from '../../hooks/useGraphData'
import { ERA_COLORS, CATEGORY_COLORS } from '../../utils/constants'
import type { Era, Category } from '../../types'

interface PersonDetailProps {
  personName: string | null
  onClose: () => void
  onNavigateTech: (id: string) => void
  onBack: (() => void) | null
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`
  return `${year} CE`
}

function PersonDetail({ personName, onClose, onNavigateTech, onBack }: PersonDetailProps) {
  const { person, contributions, loading, error } = usePersonDetail(personName)

  useEffect(() => {
    if (!personName) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [personName, onClose])

  if (!personName) return null

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>
        ✕
      </button>

      {onBack && (
        <button className="person-back" onClick={onBack}>
          ← Back
        </button>
      )}

      {loading && <div className="loading-indicator">Loading…</div>}
      {error && <div className="detail-error">Failed to load person</div>}

      {person && (
        <>
          {person.thumbnailUrl && (
            <div className="person-thumb-wrap">
              <img
                className="person-thumb"
                src={person.thumbnailUrl}
                alt={person.name}
              />
            </div>
          )}

          <h2 className="detail-name">{person.name}</h2>

          <div className="person-active-range">
            {person.activeFrom === person.activeTo
              ? formatYear(person.activeFrom)
              : `${formatYear(person.activeFrom)} – ${formatYear(person.activeTo)}`}
          </div>

          <div className="detail-meta">
            {person.eras.map((era) => (
              <span
                key={era}
                className="detail-badge"
                style={{
                  background: ERA_COLORS[era as Era] + '22',
                  color: ERA_COLORS[era as Era],
                }}
              >
                {era}
              </span>
            ))}
          </div>

          <div className="person-fields">
            <span className="detail-field-label">Fields</span>
            <div className="detail-meta">
              {person.categories.map((cat) => (
                <span
                  key={cat}
                  className="detail-badge"
                  style={{
                    background: CATEGORY_COLORS[cat as Category] + '22',
                    color: CATEGORY_COLORS[cat as Category],
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {person.regions.length > 0 && (
            <div className="detail-field">
              <span className="detail-field-label">Region</span>
              {person.regions.join(', ')}
            </div>
          )}

          {person.tags.length > 0 && (
            <div className="detail-tags">
              {person.tags.map((t) => (
                <span key={t} className="detail-tag">
                  {t}
                </span>
              ))}
            </div>
          )}

          {person.wikipediaUrl && (
            <div className="person-wiki-link">
              <a
                href={person.wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Wikipedia →
              </a>
            </div>
          )}

          <div className="detail-section">
            <span className="detail-field-label">
              Contributions ({person.contributionCount})
            </span>
            <div className="person-contributions">
              {contributions.map((c) => (
                <button
                  key={c._id}
                  className="person-contribution"
                  onClick={() => onNavigateTech(c._id)}
                >
                  <span className="person-contribution-year">
                    {c.yearDisplay}
                  </span>
                  <span className="person-contribution-name">{c.name}</span>
                  <span
                    className="person-contribution-cat"
                    style={{ color: CATEGORY_COLORS[c.category as Category] }}
                  >
                    {c.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default memo(PersonDetail)
