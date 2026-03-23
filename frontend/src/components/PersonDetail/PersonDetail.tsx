import { memo, useEffect } from 'react'
import { usePersonDetail } from '../../hooks/useGraphData'
import { useAppStore } from '../../store/useAppStore'
import { ERA_COLORS, CATEGORY_COLORS } from '../../utils/constants'
import type { Era, Category } from '../../types'

interface PersonDetailProps {
  onBack: boolean
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`
  return `${year} CE`
}

function PersonDetail({ onBack }: PersonDetailProps) {
  const personName = useAppStore((s) => s.selectedPerson)
  const closeDetail = useAppStore((s) => s.closeDetail)
  const navigateToTech = useAppStore((s) => s.navigateToTech)
  const clearPerson = useAppStore((s) => s.clearPerson)

  const addRecent = useAppStore((s) => s.addRecent)

  const { person, contributions, loading, error, retry } = usePersonDetail(personName)

  useEffect(() => {
    if (person) {
      addRecent({
        id: person.name,
        name: person.name,
        yearDisplay: person.activeFrom === person.activeTo
          ? formatYear(person.activeFrom)
          : `${formatYear(person.activeFrom)} – ${formatYear(person.activeTo)}`,
        category: person.categories[0] as Category,
        type: 'person',
      })
    }
  }, [person, addRecent])

  useEffect(() => {
    if (!personName) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [personName, closeDetail])

  if (!personName) return null

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={closeDetail}>
        ✕
      </button>

      {onBack && (
        <button className="person-back" onClick={clearPerson}>
          ← Back
        </button>
      )}

      {loading && <div className="loading-indicator">Loading…</div>}
      {error && (
        <div className="detail-error">
          {error} <button className="retry-btn" onClick={retry}>Retry</button>
        </div>
      )}

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
                  onClick={() => navigateToTech(c._id)}
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
