import { useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { ERA_BOUNDARIES } from '../../utils/constants'
import type { GraphNode, EraBoundary } from '../../types'

// Minimum share of space any era can get (prevents near-invisible eras)
const MIN_ERA_SHARE = 0.04

export function useTimeScale(nodes: GraphNode[]) {
  const timeExtent = useMemo((): [number, number] => {
    if (!nodes.length) return [-3000000, 2003]
    const years = nodes.map((n) => n.year)
    return [Math.min(...years), Math.max(...years)]
  }, [nodes])

  const visibleEras = useMemo((): EraBoundary[] => {
    const [minY, maxY] = timeExtent
    return ERA_BOUNDARIES.filter((b) => b.end > minY && b.start < maxY)
  }, [timeExtent])

  // Count nodes per era for proportional sizing
  const eraNodeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of visibleEras) counts.set(b.era, 0)
    for (const n of nodes) {
      const era = (n as GraphNode & { era?: string }).era
      if (era && counts.has(era)) counts.set(era, counts.get(era)! + 1)
    }
    return counts
  }, [nodes, visibleEras])

  const buildTimeScale = useCallback(
    (rangeStart: number, rangeEnd: number): d3.ScaleLinear<number, number> => {
      if (!visibleEras.length) {
        return d3.scaleLinear().domain(timeExtent).range([rangeStart, rangeEnd])
      }

      const totalRange = rangeEnd - rangeStart
      const totalNodes = Array.from(eraNodeCounts.values()).reduce((a, b) => a + b, 0)

      // Calculate proportional widths based on node count
      // Each era gets at least MIN_ERA_SHARE of the total space
      const rawShares = visibleEras.map((b) => {
        const count = eraNodeCounts.get(b.era) || 0
        return Math.max(count / (totalNodes || 1), MIN_ERA_SHARE)
      })
      const shareSum = rawShares.reduce((a, b) => a + b, 0)
      const normalizedWidths = rawShares.map((s) => (s / shareSum) * totalRange)

      const domain: number[] = []
      const range: number[] = []
      let cursor = rangeStart
      visibleEras.forEach((b, i) => {
        const clampedStart = Math.max(b.start, timeExtent[0])
        const clampedEnd = Math.min(b.end, timeExtent[1])
        if (i === 0) {
          domain.push(clampedStart)
          range.push(cursor)
        }
        cursor += normalizedWidths[i]
        domain.push(clampedEnd)
        range.push(cursor)
      })
      return d3.scaleLinear().domain(domain).range(range).clamp(true)
    },
    [visibleEras, timeExtent, eraNodeCounts],
  )

  return { timeExtent, visibleEras, buildTimeScale }
}
