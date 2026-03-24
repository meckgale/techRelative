import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { API_BASE } from '../utils/constants'

/**
 * Curated technologies that are widely recognizable and have rich connections.
 * Spread across all eras so returning users see variety.
 */
const FEATURED_TECHS = [
  // Ancient
  'Bronze',
  'Irrigation',
  'Iron smelting',
  // Classical
  'Steel',
  // Medieval
  'Compass',
  'Gunpowder',
  'Clock',
  // Early Modern
  'Spinning Wheel',
  'Rubber',
  // Industrial
  'Telephone',
  'Telegraph',
  'Dynamite',
  'Photography',
  'Steam locomotive',
  'Electric battery',
  'Microscope',
  'Typewriter',
  'Phonograph',
  // Modern
  'ARPANET',
  'Penicillin',
  'Laser',
  'Double-helix model for DNA',
  'Antibiotic',
  // Information
  'World Wide Web',
  'Unix',
  'Ethernet',
  'Human Genome Project',
]

export function useAutoSelect() {
  const ran = useRef(false)
  const selectNode = useAppStore((s) => s.selectNode)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const name = FEATURED_TECHS[Math.floor(Math.random() * FEATURED_TECHS.length)]
    const params = new URLSearchParams({ search: name, limit: '1' })

    fetch(`${API_BASE}/technologies?${params}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const tech = data?.technologies?.[0]
        if (tech?._id && !useAppStore.getState().selectedId) {
          selectNode(tech._id)
        }
      })
      .catch(() => { /* silent — not critical */ })
  }, [selectNode])
}
