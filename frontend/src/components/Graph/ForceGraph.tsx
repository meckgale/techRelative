import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { memo } from 'react'
import * as d3 from 'd3'
import {
  ERA_COLORS,
  CATEGORY_COLORS,
  ERA_BOUNDARIES,
} from '../../utils/constants'
import type { GraphNode, GraphEdge, ColorBy, ViewMode, Era, EraBoundary } from '../../types'

const NODE_RADIUS = 4
const HOVER_RADIUS = 8
const LABEL_THRESHOLD = 1.4
const AXIS_SIZE = 36 // px reserved for the era axis (bottom in landscape, left in portrait)
const TIMELINE_PADDING = 60 // px margin along the timeline axis
const MOBILE_QUERY = '(max-width: 768px)'

interface AdjEntry {
  node: GraphNode
  neighbors: Set<string>
  edges: GraphEdge[]
}

interface TooltipState {
  x: number
  y: number
  node: GraphNode
}

interface ForceGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colorBy?: ColorBy
  onNodeClick?: (id: string) => void
  selectedId?: string | null
  searchTerm?: string
  viewMode?: ViewMode
  loading?: boolean
}

function ForceGraph({
  nodes,
  edges,
  colorBy = 'era',
  onNodeClick,
  selectedId = null,
  searchTerm = '',
  viewMode = 'technology',
  loading = false,
}: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null)
  const transformRef = useRef(d3.zoomIdentity)
  const hoveredRef = useRef<GraphNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const timeScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const drawRef = useRef<(() => void) | null>(null)
  const quadtreeRef = useRef<d3.Quadtree<GraphNode> | null>(null)
  const portraitRef = useRef(window.matchMedia(MOBILE_QUERY).matches)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // ─── TIME SCALE ───────────────────────────────────────────
  // Each era gets equal screen width — piecewise linear within each era.
  // This prevents Prehistoric's 3M-year span from crushing all modern eras.
  const timeExtent = useMemo((): [number, number] => {
    if (!nodes.length) return [-3000000, 2003]
    const years = nodes.map((n) => n.year)
    return [Math.min(...years), Math.max(...years)]
  }, [nodes])

  // Filter era boundaries to only those visible in current data
  const visibleEras = useMemo(() => {
    const [minY, maxY] = timeExtent
    return ERA_BOUNDARIES.filter((b) => b.end > minY && b.start < maxY)
  }, [timeExtent])

  // Build a piecewise linear scale: equal screen width per visible era
  const buildTimeScale = useCallback(
    (rangeStart: number, rangeEnd: number) => {
      if (!visibleEras.length) {
        return d3.scaleLinear().domain(timeExtent).range([rangeStart, rangeEnd])
      }
      const eraWidth = (rangeEnd - rangeStart) / visibleEras.length
      // Build domain/range breakpoints for d3.scaleLinear (piecewise)
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

  // Keep selectedId in a ref so the draw loop can access it
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

    ctx.clearRect(0, 0, width, height)

    // ── Era bands (drawn in screen space, behind everything) ──
    const portrait = portraitRef.current
    if (timeScale) {
      if (portrait) {
        // ── PORTRAIT: horizontal bands, axis on left ──
        const graphLeft = AXIS_SIZE

        visibleEras.forEach((b: EraBoundary, i: number) => {
          const yStart = t.y + t.k * timeScale(Math.max(b.start, timeExtent[0]))
          const yEnd = t.y + t.k * timeScale(Math.min(b.end, timeExtent[1]))
          const bh = yEnd - yStart
          if (yEnd < 0 || yStart > height) return

          ctx.fillStyle =
            i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.0)'
          ctx.fillRect(graphLeft, yStart, width - graphLeft, bh)

          ctx.strokeStyle = 'rgba(255,255,255,0.06)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(graphLeft, yStart)
          ctx.lineTo(width, yStart)
          ctx.stroke()
        })

        // Axis bar on left
        ctx.fillStyle = 'rgba(14, 16, 21, 0.95)'
        ctx.fillRect(0, 0, graphLeft, height)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(graphLeft, 0)
        ctx.lineTo(graphLeft, height)
        ctx.stroke()

        // Era labels in the left axis bar (rotated vertically)
        ctx.font = '9px monospace'
        visibleEras.forEach((b: EraBoundary) => {
          const yStart = t.y + t.k * timeScale(Math.max(b.start, timeExtent[0]))
          const yEnd = t.y + t.k * timeScale(Math.min(b.end, timeExtent[1]))
          const cy = (yStart + yEnd) / 2
          const bh = yEnd - yStart

          if (cy < -100 || cy > height + 100) return

          const eraColor = ERA_COLORS[b.era as Era] || '#666'

          // Always show color dot if band is at least 10px
          if (bh >= 10) {
            ctx.fillStyle = eraColor
            ctx.beginPath()
            ctx.arc(graphLeft / 2, cy, 3, 0, Math.PI * 2)
            ctx.fill()
          }

          // Only show text if it fits (rotated, so text width = vertical space needed)
          const labelLen = ctx.measureText(b.era).width + 14
          if (bh >= labelLen) {
            ctx.save()
            ctx.translate(graphLeft / 2, cy)
            ctx.rotate(-Math.PI / 2)
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(b.era, 0, -6)
            ctx.restore()
          }
        })
      } else {
        // ── LANDSCAPE: vertical bands, axis at bottom ──
        const graphBottom = height - AXIS_SIZE

        visibleEras.forEach((b: EraBoundary, i: number) => {
          const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
          const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
          const bw = xEnd - xStart
          if (xEnd < 0 || xStart > width) return

          ctx.fillStyle =
            i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.0)'
          ctx.fillRect(xStart, 0, bw, graphBottom)

          ctx.strokeStyle = 'rgba(255,255,255,0.06)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(xStart, 0)
          ctx.lineTo(xStart, graphBottom)
          ctx.stroke()
        })

        // Axis bar at bottom
        ctx.fillStyle = 'rgba(14, 16, 21, 0.95)'
        ctx.fillRect(0, graphBottom, width, AXIS_SIZE)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, graphBottom)
        ctx.lineTo(width, graphBottom)
        ctx.stroke()

        // Era labels in the axis bar
        ctx.font = '10px monospace'
        const axisY = graphBottom + AXIS_SIZE / 2
        visibleEras.forEach((b: EraBoundary) => {
          const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
          const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
          const cx = (xStart + xEnd) / 2
          const bw = xEnd - xStart

          if (cx < -100 || cx > width + 100) return

          const eraColor = ERA_COLORS[b.era as Era] || '#666'

          // Always show color dot if band is at least 10px
          if (bw >= 10) {
            ctx.fillStyle = eraColor
            ctx.beginPath()
            ctx.arc(cx, axisY, 3, 0, Math.PI * 2)
            ctx.fill()
          }

          // Only show text if it fits
          const labelLen = ctx.measureText(b.era).width + 14
          if (bw >= labelLen) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(b.era, cx + 6, axisY)
          }
        })
      }
    }

    // ── Graph content (clipped to graph area, then transformed) ──
    ctx.save()
    ctx.beginPath()
    if (portrait) {
      ctx.rect(AXIS_SIZE, 0, width - AXIS_SIZE, height)
    } else {
      ctx.rect(0, 0, width, height - AXIS_SIZE)
    }
    ctx.clip()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    const selId = selectedIdRef.current
    const selNeighbors = selId ? adjMap.current.get(selId)?.neighbors : null
    const hovered = hoveredRef.current
    const hoveredNeighbors = hovered
      ? adjMap.current.get(hovered._id)?.neighbors
      : null
    const hasSearch = searchSet.current.size > 0
    const isHighlighted = (n: GraphNode) => {
      if (selId) {
        return n._id === selId || selNeighbors?.has(n._id)
      }
      if (hovered) {
        return n._id === hovered._id || hoveredNeighbors?.has(n._id)
      }
      if (hasSearch) return searchSet.current.has(n._id)
      return true
    }

    // Edges
    edges.forEach((e) => {
      const s = e.source as GraphNode
      const tgt = e.target as GraphNode
      if (!s.x || !tgt.x) return

      const sHi = isHighlighted(s)
      const tHi = isHighlighted(tgt)
      const active = sHi && tHi

      if (selId && active) {
        ctx.strokeStyle = 'rgba(220,80,60,0.25)'
        ctx.lineWidth = 0.5
        ctx.shadowBlur = 0
      } else if (active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 0.3
        ctx.shadowBlur = 0
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.02)'
        ctx.lineWidth = 0.3
        ctx.shadowBlur = 0
      }
      ctx.beginPath()
      ctx.moveTo(s.x, s.y!)
      ctx.lineTo(tgt.x, tgt.y!)
      ctx.stroke()
    })
    ctx.shadowBlur = 0

    // Nodes
    const isPerson = viewMode === 'person'
    nodes.forEach((n) => {
      if (!n.x) return
      const hi = isHighlighted(n)
      const isHovered = hovered && n._id === hovered._id
      const isSelected = selId && n._id === selId
      const r = isSelected || isHovered ? HOVER_RADIUS : NODE_RADIUS
      const sr = r / t.k // screen-space radius

      ctx.globalAlpha = hi ? 1 : 0.04
      ctx.fillStyle = getColor(n)

      if (isPerson) {
        // Diamond shape for person nodes
        ctx.beginPath()
        ctx.moveTo(n.x, n.y! - sr * 1.2)
        ctx.lineTo(n.x + sr, n.y!)
        ctx.lineTo(n.x, n.y! + sr * 1.2)
        ctx.lineTo(n.x - sr, n.y!)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(n.x, n.y!, sr, 0, Math.PI * 2)
        ctx.fill()
      }

      if (isSelected) {
        ctx.shadowColor = getColor(n)
        ctx.shadowBlur = 12 / t.k
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / t.k
        ctx.stroke()
        ctx.shadowBlur = 0
      }
      if (isHovered && !isSelected) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / t.k
        ctx.stroke()
      }
    })

    ctx.globalAlpha = 1

    // Labels at higher zoom
    if (t.k >= LABEL_THRESHOLD) {
      ctx.fillStyle = '#e0e0e0'
      ctx.font = `${11 / t.k}px monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      nodes.forEach((n) => {
        if (!n.x) return
        if (!isHighlighted(n)) return
        ctx.fillText(n.name, n.x + (NODE_RADIUS + 3) / t.k, n.y!)
      })
    }

    ctx.restore()
  }, [nodes, edges, getColor, visibleEras, timeExtent, viewMode])

  // Keep draw in a ref so the simulation can call the latest version
  // without draw being a dependency of the simulation effect
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

    // Build piecewise time scale along the timeline axis
    let timeScale: d3.ScaleLinear<number, number>
    if (isPortrait) {
      // Portrait: year → y pixel (top to bottom)
      timeScale = buildTimeScale(TIMELINE_PADDING, height - TIMELINE_PADDING)
    } else {
      // Landscape: year → x pixel (left to right)
      timeScale = buildTimeScale(TIMELINE_PADDING, width - TIMELINE_PADDING)
    }

    timeScaleRef.current = timeScale

    // Stop any existing simulation
    simRef.current?.stop()

    const graphWidth = isPortrait ? width - AXIS_SIZE : width
    const graphHeight = isPortrait ? height : height - AXIS_SIZE
    const centerX = isPortrait ? AXIS_SIZE + graphWidth / 2 : width / 2
    const centerY = isPortrait ? height / 2 : graphHeight / 2

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
      // Strong pull along timeline axis, weak centering on the other
      .force('x', isPortrait
        ? d3.forceX<GraphNode>(centerX).strength(0.05)
        : d3.forceX<GraphNode>((d) => timeScale(d.year)).strength(0.8))
      .force('y', isPortrait
        ? d3.forceY<GraphNode>((d) => timeScale(d.year)).strength(0.8)
        : d3.forceY<GraphNode>(centerY).strength(0.05))
      .force('collision', d3.forceCollide(NODE_RADIUS + 1))
      .alphaDecay(0.03)
      .velocityDecay(0.4)

    let tickCount = 0
    sim.on('tick', () => {
      tickCount++
      if (tickCount > 150 || sim.alpha() < 0.01) {
        sim.stop()
        // Build quadtree once after simulation settles
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

    const sel = d3.select(canvas)
    sel.call(zoom)

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
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const found = findNode(mx, my) ?? null

      // When a node is selected, only allow hovering its neighbors
      const selId = selectedIdRef.current
      if (selId) {
        const selNeighbors = adjMap.current.get(selId)?.neighbors
        const isNeighbor =
          found && (found._id === selId || selNeighbors?.has(found._id))
        const allowed = isNeighbor ? found : null

        if (allowed !== hoveredRef.current) {
          hoveredRef.current = allowed
          canvas.style.cursor = allowed ? 'pointer' : 'default'
          if (allowed) {
            setTooltip({ x: event.clientX, y: event.clientY, node: allowed })
          } else {
            setTooltip(null)
          }
          drawRef.current?.()
        }
        return
      }

      if (found !== hoveredRef.current) {
        hoveredRef.current = found
        canvas.style.cursor = found ? 'pointer' : 'default'
        if (found) {
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            node: found,
          })
        } else {
          setTooltip(null)
        }
        drawRef.current?.()
      }
    }

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const found = findNode(
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
      if (found && onNodeClick) {
        onNodeClick(found._id)
        hoveredRef.current = null
        setTooltip(null)
      } else if (!found && selectedIdRef.current && onNodeClick) {
        // Click on empty space deselects
        onNodeClick(selectedIdRef.current)
        hoveredRef.current = null
        setTooltip(null)
      }
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      const rect = canvas.getBoundingClientRect()
      const found = findNode(
        touch.clientX - rect.left,
        touch.clientY - rect.top,
      )
      if (found && onNodeClick) {
        event.preventDefault()
        onNodeClick(found._id)
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
      if (nowPortrait) {
        newScale = buildTimeScale(TIMELINE_PADDING, h - TIMELINE_PADDING)
        const newCenterX = AXIS_SIZE + (w - AXIS_SIZE) / 2
        sim.force('x', d3.forceX<GraphNode>(newCenterX).strength(0.05))
        sim.force('y', d3.forceY<GraphNode>((d) => newScale(d.year)).strength(0.15))
      } else {
        newScale = buildTimeScale(TIMELINE_PADDING, w - TIMELINE_PADDING)
        const newCenterY = (h - AXIS_SIZE) / 2
        sim.force('x', d3.forceX<GraphNode>((d) => newScale(d.year)).strength(0.15))
        sim.force('y', d3.forceY<GraphNode>(newCenterY).strength(0.05))
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
  }, [nodes, edges, onNodeClick, timeExtent, buildTimeScale])

  // Redraw when colorBy, search, or selection changes (no sim restart needed)
  useEffect(() => {
    draw()
  }, [colorBy, searchTerm, selectedId, draw])

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
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: 'rgba(15, 15, 20, 0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 100,
            maxWidth: 280,
          }}
        >
          <div
            style={{
              color: getColor(tooltip.node),
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 2,
            }}
          >
            {tooltip.node.name}
          </div>
          <div style={{ color: '#aaa', fontSize: 11 }}>
            {tooltip.node.yearDisplay} · {tooltip.node.era}
          </div>
          <div style={{ color: '#888', fontSize: 11 }}>
            {tooltip.node.category}
            {'contributionCount' in tooltip.node &&
              tooltip.node.contributionCount != null &&
              ` · ${tooltip.node.contributionCount} contributions`}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ForceGraph)
