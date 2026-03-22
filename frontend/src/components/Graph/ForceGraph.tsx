import { useEffect, useRef, useCallback, useState } from 'react'
import { memo } from 'react'
import * as d3 from 'd3'
import { ERA_COLORS, CATEGORY_COLORS, CATEGORIES } from '../../utils/constants'
import { useAppStore, useActiveSelectedId } from '../../store/useAppStore'
import { useTimeScale } from './useTimeScale'
import { drawEraAxis, AXIS_SIZE } from './drawEraAxis'
import { drawGraphContent, NODE_RADIUS } from './drawGraphContent'
import GraphTooltip from './GraphTooltip'
import type { TooltipState } from './GraphTooltip'
import type { GraphNode, GraphEdge } from '../../types'
import { ERA_BOUNDARIES } from '../../utils/constants'

const TIMELINE_PADDING = 60
const MOBILE_QUERY = '(max-width: 768px)'

interface AdjEntry {
  node: GraphNode
  neighbors: Set<string>
  edges: GraphEdge[]
}

interface ForceGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  loading?: boolean
}

function ForceGraph({
  nodes,
  edges,
  loading = false,
}: ForceGraphProps) {
  const colorBy = useAppStore((s) => s.colorBy)
  const searchTerm = useAppStore((s) => s.searchTerm)
  const viewMode = useAppStore((s) => s.viewMode)
  const selectNode = useAppStore((s) => s.selectNode)
  const selectedId = useActiveSelectedId()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null)
  const transformRef = useRef(d3.zoomIdentity)
  const hoveredRef = useRef<GraphNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const timeScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const drawRef = useRef<(() => void) | null>(null)
  const quadtreeRef = useRef<d3.Quadtree<GraphNode> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const portraitRef = useRef(window.matchMedia(MOBILE_QUERY).matches)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { timeExtent, visibleEras, buildTimeScale } = useTimeScale(nodes)

  // ─── ADJACENCY MAP ────────────────────────────────────────
  const adjMap = useRef(new Map<string, AdjEntry>())
  useEffect(() => {
    const m = new Map<string, AdjEntry>()
    nodes.forEach((n) =>
      m.set(n._id, { node: n, neighbors: new Set(), edges: [] }),
    )
    edges.forEach((e) => {
      const sId = typeof e.source === 'object' ? e.source._id : e.source
      const tId = typeof e.target === 'object' ? e.target._id : e.target
      m.get(sId)?.neighbors.add(tId)
      m.get(tId)?.neighbors.add(sId)
      m.get(sId)?.edges.push(e)
      m.get(tId)?.edges.push(e)
    })
    adjMap.current = m
  }, [nodes, edges])

  // ─── SEARCH MATCHES ───────────────────────────────────────
  const searchSet = useRef(new Set<string>())
  useEffect(() => {
    const s = new Set<string>()
    if (searchTerm.length >= 2) {
      const lower = searchTerm.toLowerCase()
      nodes.forEach((n) => {
        if (n.name.toLowerCase().includes(lower)) s.add(n._id)
      })
    }
    searchSet.current = s
  }, [searchTerm, nodes])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const getColor = useCallback(
    (node: GraphNode): string => {
      const palette = colorBy === 'era' ? ERA_COLORS : CATEGORY_COLORS
      return (palette as Record<string, string>)[node[colorBy]] || '#666'
    },
    [colorBy],
  )

  // ─── RENDER LOOP ──────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    const t = transformRef.current
    const timeScale = timeScaleRef.current
    const portrait = portraitRef.current

    ctx.clearRect(0, 0, width, height)

    if (timeScale) {
      drawEraAxis({ ctx, width, height, transform: t, timeScale, visibleEras, timeExtent, portrait })
    }

    const selId = selectedIdRef.current
    drawGraphContent({
      ctx,
      width,
      height,
      transform: t,
      nodes,
      edges,
      viewMode,
      portrait,
      highlight: {
        selectedId: selId,
        selectedNeighbors: selId ? adjMap.current.get(selId)?.neighbors : null,
        hovered: hoveredRef.current,
        hoveredNeighbors: hoveredRef.current
          ? adjMap.current.get(hoveredRef.current._id)?.neighbors
          : null,
        searchMatches: searchSet.current,
      },
      getColor,
    })
  }, [nodes, edges, getColor, visibleEras, timeExtent, viewMode])

  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  // ─── SIMULATION ─────────────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return

    const canvas = canvasRef.current
    if (!canvas || !canvas.parentElement) return
    const width = canvas.parentElement.clientWidth
    const height = canvas.parentElement.clientHeight
    canvas.width = width
    canvas.height = height

    const isPortrait = portraitRef.current

    let timeScale: d3.ScaleLinear<number, number>
    if (isPortrait) {
      timeScale = buildTimeScale(TIMELINE_PADDING, height - TIMELINE_PADDING)
    } else {
      timeScale = buildTimeScale(TIMELINE_PADDING, width - TIMELINE_PADDING)
    }
    timeScaleRef.current = timeScale

    simRef.current?.stop()

    const graphHeight = isPortrait ? height : height - AXIS_SIZE
    const crossStart = isPortrait ? AXIS_SIZE + TIMELINE_PADDING : TIMELINE_PADDING
    const crossEnd = isPortrait ? width - TIMELINE_PADDING : graphHeight - TIMELINE_PADDING

    // Map each category to a position on the cross-axis (alphabetical order)
    const categoryScale = new Map<string, number>()
    const catPadding = (crossEnd - crossStart) / CATEGORIES.length
    CATEGORIES.forEach((cat, i) => {
      categoryScale.set(cat, crossStart + catPadding * (i + 0.5))
    })
    const getCategoryPos = (d: GraphNode) => categoryScale.get(d.category) ?? (crossStart + crossEnd) / 2

    // Pre-position nodes at their target era/category positions (with jitter)
    // so the simulation only needs to resolve collisions and links
    for (const n of nodes) {
      if (n.x != null && n.y != null) continue
      const timePos = timeScale(n.year)
      const catPos = getCategoryPos(n)
      const jitter = () => (Math.random() - 0.5) * 30
      if (isPortrait) {
        n.x = catPos + jitter()
        n.y = timePos + jitter()
      } else {
        n.x = timePos + jitter()
        n.y = catPos + jitter()
      }
    }

    // Build era boundary lookup for clamping nodes within their era band
    const eraBandCache = new Map<string, { min: number; max: number }>()
    for (const b of ERA_BOUNDARIES) {
      const bandMin = timeScale(Math.max(b.start, timeExtent[0]))
      const bandMax = timeScale(Math.min(b.end, timeExtent[1]))
      eraBandCache.set(b.era, { min: bandMin, max: bandMax })
    }

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((d) => (d as GraphNode)._id)
          .distance(60)
          .strength(0.1),
      )
      .force('charge', d3.forceManyBody().strength(-30).distanceMax(300))
      .force('x', isPortrait
        ? d3.forceX<GraphNode>(getCategoryPos).strength(0.3)
        : d3.forceX<GraphNode>((d) => timeScale(d.year)).strength(1.2))
      .force('y', isPortrait
        ? d3.forceY<GraphNode>((d) => timeScale(d.year)).strength(1.2)
        : d3.forceY<GraphNode>(getCategoryPos).strength(0.3))
      .force('collision', d3.forceCollide(NODE_RADIUS + 1))
      .alphaDecay(0.05)
      .velocityDecay(0.5)

    let tickCount = 0
    sim.on('tick', () => {
      tickCount++

      // Soft-clamp nodes toward their era band boundaries (every 3rd tick to save work)
      if (tickCount % 3 === 0) {
        const alpha = sim.alpha()
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue
          const band = eraBandCache.get(n.era as string)
          if (!band) continue

          const pos = isPortrait ? n.y : n.x
          const margin = 8
          if (pos < band.min - margin) {
            if (isPortrait) n.y! += (band.min - margin - pos) * alpha * 0.8
            else n.x! += (band.min - margin - pos) * alpha * 0.8
          } else if (pos > band.max + margin) {
            if (isPortrait) n.y! += (band.max + margin - pos) * alpha * 0.8
            else n.x! += (band.max + margin - pos) * alpha * 0.8
          }
        }
      }

      if (tickCount > 120 || sim.alpha() < 0.01) {
        sim.stop()
        rebuildQuadtree()
      }
      drawRef.current?.()
    })

    simRef.current = sim

    // ─── ZOOM ───────────────────────────────────────────────
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        transformRef.current = event.transform
        drawRef.current?.()
      })

    zoomRef.current = zoom
    d3.select(canvas).call(zoom)

    // ─── MOUSE INTERACTION ──────────────────────────────────
    const rebuildQuadtree = () => {
      quadtreeRef.current = d3
        .quadtree<GraphNode>()
        .x((d) => d.x!)
        .y((d) => d.y!)
        .addAll(nodes.filter((n) => n.x !== undefined))
    }

    const findNode = (mx: number, my: number): GraphNode | undefined => {
      if (!quadtreeRef.current) return undefined
      const t = transformRef.current
      const x = (mx - t.x) / t.k
      const y = (my - t.y) / t.k
      const radius = 12 / t.k
      return quadtreeRef.current.find(x, y, radius) ?? undefined
    }

    const handleMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const found = findNode(event.clientX - rect.left, event.clientY - rect.top) ?? null

      const selId = selectedIdRef.current
      if (selId) {
        const selNeighbors = adjMap.current.get(selId)?.neighbors
        const isNeighbor = found && (found._id === selId || selNeighbors?.has(found._id))
        const allowed = isNeighbor ? found : null

        if (allowed !== hoveredRef.current) {
          hoveredRef.current = allowed
          canvas.style.cursor = allowed ? 'pointer' : 'default'
          setTooltip(allowed ? { x: event.clientX, y: event.clientY, node: allowed } : null)
          drawRef.current?.()
        }
        return
      }

      if (found !== hoveredRef.current) {
        hoveredRef.current = found
        canvas.style.cursor = found ? 'pointer' : 'default'
        setTooltip(found ? { x: event.clientX, y: event.clientY, node: found } : null)
        drawRef.current?.()
      }
    }

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const found = findNode(event.clientX - rect.left, event.clientY - rect.top)
      if (found) {
        selectNode(found._id)
      } else if (selectedIdRef.current) {
        selectNode(selectedIdRef.current)
      }
      hoveredRef.current = null
      setTooltip(null)
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      const rect = canvas.getBoundingClientRect()
      const found = findNode(touch.clientX - rect.left, touch.clientY - rect.top)
      if (found) {
        event.preventDefault()
        selectNode(found._id)
        hoveredRef.current = null
        setTooltip(null)
      }
    }

    canvas.addEventListener('mousemove', handleMove)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })

    // ─── RESIZE + ORIENTATION CHANGE ──────────────────────
    const mq = window.matchMedia(MOBILE_QUERY)
    const handleOrientationOrResize = () => {
      if (!canvas.parentElement) return
      const { clientWidth: w, clientHeight: h } = canvas.parentElement
      canvas.width = w
      canvas.height = h

      const nowPortrait = mq.matches
      portraitRef.current = nowPortrait

      let newScale: d3.ScaleLinear<number, number>
      const newGraphHeight = nowPortrait ? h : h - AXIS_SIZE
      const newCrossStart = nowPortrait ? AXIS_SIZE + TIMELINE_PADDING : TIMELINE_PADDING
      const newCrossEnd = nowPortrait ? w - TIMELINE_PADDING : newGraphHeight - TIMELINE_PADDING
      const newCatScale = new Map<string, number>()
      const newCatPad = (newCrossEnd - newCrossStart) / CATEGORIES.length
      CATEGORIES.forEach((cat, i) => {
        newCatScale.set(cat, newCrossStart + newCatPad * (i + 0.5))
      })
      const newGetCatPos = (d: GraphNode) => newCatScale.get(d.category) ?? (newCrossStart + newCrossEnd) / 2

      if (nowPortrait) {
        newScale = buildTimeScale(TIMELINE_PADDING, h - TIMELINE_PADDING)
        sim.force('x', d3.forceX<GraphNode>(newGetCatPos).strength(0.3))
        sim.force('y', d3.forceY<GraphNode>((d) => newScale(d.year)).strength(1.2))
      } else {
        newScale = buildTimeScale(TIMELINE_PADDING, w - TIMELINE_PADDING)
        sim.force('x', d3.forceX<GraphNode>((d) => newScale(d.year)).strength(1.2))
        sim.force('y', d3.forceY<GraphNode>(newGetCatPos).strength(0.3))
      }
      timeScaleRef.current = newScale
      sim.alpha(0.3).restart()
    }

    const resizeObs = new ResizeObserver(handleOrientationOrResize)
    resizeObs.observe(canvas.parentElement)
    mq.addEventListener('change', handleOrientationOrResize)

    return () => {
      sim.stop()
      canvas.removeEventListener('mousemove', handleMove)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('touchend', handleTouchEnd)
      resizeObs.disconnect()
      mq.removeEventListener('change', handleOrientationOrResize)
    }
  }, [nodes, edges, selectNode, timeExtent, buildTimeScale])

  // Redraw when colorBy, search, or selection changes (no sim restart needed)
  useEffect(() => {
    draw()
  }, [colorBy, searchTerm, selectedId, draw])

  // ─── FOCUS / RESET ZOOM ON SELECTION CHANGE ──────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const zoom = zoomRef.current
    if (!canvas || !zoom) return

    if (selectedId) {
      const node = nodes.find((n) => n._id === selectedId)
      if (!node || node.x == null || node.y == null) return
      const scale = 2.5
      const tx = canvas.width / 2 - node.x * scale
      const ty = canvas.height / 2 - node.y * scale
      const target = d3.zoomIdentity.translate(tx, ty).scale(scale)
      d3.select(canvas).transition().duration(500).call(zoom.transform, target)
    } else {
      d3.select(canvas).transition().duration(500).call(zoom.transform, d3.zoomIdentity)
    }
  }, [selectedId, nodes])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      {loading && (
        <div className="graph-loader">
          <div className="graph-loader-dot" />
          <div className="graph-loader-dot" />
          <div className="graph-loader-dot" />
        </div>
      )}
      {nodes.length === 0 && !loading && (
        <div className="graph-empty">
          {viewMode === 'person'
            ? 'No persons match this filter'
            : 'No technologies match this filter'}
        </div>
      )}
      {tooltip && <GraphTooltip tooltip={tooltip} getColor={getColor} />}
    </div>
  )
}

export default memo(ForceGraph)
