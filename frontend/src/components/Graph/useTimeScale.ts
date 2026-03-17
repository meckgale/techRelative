import { useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { ERA_BOUNDARIES } from '../../utils/constants'
import type { GraphNode, EraBoundary } from '../../types'

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

  const buildTimeScale = useCallback(
    (rangeStart: number, rangeEnd: number): d3.ScaleLinear<number, number> => {
      if (!visibleEras.length) {
        return d3.scaleLinear().domain(timeExtent).range([rangeStart, rangeEnd])
      }
      const eraWidth = (rangeEnd - rangeStart) / visibleEras.length
      const domain: number[] = []
      const range: number[] = []
      visibleEras.forEach((b, i) => {
        const clampedStart = Math.max(b.start, timeExtent[0])
        const clampedEnd = Math.min(b.end, timeExtent[1])
        if (i === 0) {
          domain.push(clampedStart)
          range.push(rangeStart)
        }
        domain.push(clampedEnd)
        range.push(rangeStart + eraWidth * (i + 1))
      })
      return d3.scaleLinear().domain(domain).range(range).clamp(true)
    },
    [visibleEras, timeExtent],
  )

  return { timeExtent, visibleEras, buildTimeScale }
}
