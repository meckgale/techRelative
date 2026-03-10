import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { memo } from 'react'
import * as d3 from 'd3'
import {
  ERA_COLORS,
  CATEGORY_COLORS,
  ERA_BOUNDARIES,
} from '../../utils/constants'

const NODE_RADIUS = 4
const HOVER_RADIUS = 8
const LABEL_THRESHOLD = 1.4
const AXIS_HEIGHT = 36 // px reserved at bottom for the era axis
const TIMELINE_PADDING = 60 // px margin left/right

function ForceGraph({
  nodes,
  edges,
  colorBy = 'era',
  onNodeClick,
  searchTerm = '',
}) {
  const canvasRef = useRef(null)
  const simRef = useRef(null)
  const transformRef = useRef(d3.zoomIdentity)
  const hoveredRef = useRef(null)
  const timeScaleRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  // ─── TIME SCALE ───────────────────────────────────────────
  // Each era gets equal screen width — piecewise linear within each era.
  // This prevents Prehistoric's 3M-year span from crushing all modern eras.
  const timeExtent = useMemo(() => {
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
    (rangeStart, rangeEnd) => {
      if (!visibleEras.length) {
        return d3.scaleLinear().domain(timeExtent).range([rangeStart, rangeEnd])
      }
      const eraWidth = (rangeEnd - rangeStart) / visibleEras.length
      // Build domain/range breakpoints for d3.scaleLinear (piecewise)
      const domain = []
      const range = []
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
  const adjMap = useRef(new Map())
  useEffect(() => {
    const m = new Map()
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
  const searchSet = useRef(new Set())
  useEffect(() => {
    const s = new Set()
    if (searchTerm.length >= 2) {
      const lower = searchTerm.toLowerCase()
      nodes.forEach((n) => {
        if (n.name.toLowerCase().includes(lower)) s.add(n._id)
      })
    }
    searchSet.current = s
  }, [searchTerm, nodes])

  const getColor = useCallback(
    (node) => {
      const palette = colorBy === 'era' ? ERA_COLORS : CATEGORY_COLORS
      return palette[node[colorBy]] || '#666'
    },
    [colorBy],
  )

  // ─── RENDER LOOP ──────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const t = transformRef.current
    const timeScale = timeScaleRef.current

    ctx.clearRect(0, 0, width, height)

    // ── Era bands (drawn in screen space, behind everything) ──
    if (timeScale) {
      const graphBottom = height - AXIS_HEIGHT

      // Band fills across the graph area
      visibleEras.forEach((b, i) => {
        const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
        const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
        const bw = xEnd - xStart
        if (xEnd < 0 || xStart > width) return

        // Subtle alternating band
        ctx.fillStyle =
          i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.0)'
        ctx.fillRect(xStart, 0, bw, graphBottom)

        // Vertical separator line
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xStart, 0)
        ctx.lineTo(xStart, graphBottom)
        ctx.stroke()
      })

      // ── Axis bar at bottom ──
      ctx.fillStyle = 'rgba(14, 16, 21, 0.95)'
      ctx.fillRect(0, graphBottom, width, AXIS_HEIGHT)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, graphBottom)
      ctx.lineTo(width, graphBottom)
      ctx.stroke()

      // Era labels in the axis bar
      visibleEras.forEach((b) => {
        const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
        const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
        const cx = (xStart + xEnd) / 2
        const bw = xEnd - xStart

        if (cx < -100 || cx > width + 100) return

        // Era color dot
        const eraColor = ERA_COLORS[b.era] || '#666'
        ctx.fillStyle = eraColor
        ctx.beginPath()
        ctx.arc(cx - 4, graphBottom + AXIS_HEIGHT / 2, 3, 0, Math.PI * 2)
        ctx.fill()

        // Label — only show if band is wide enough
        if (bw > 50) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.font = '10px monospace'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillText(b.era, cx + 4, graphBottom + AXIS_HEIGHT / 2)
        }
      })
    }

    // ── Graph content (transformed) ──
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    const hovered = hoveredRef.current
    const hoveredNeighbors = hovered
      ? adjMap.current.get(hovered._id)?.neighbors
      : null
    const hasSearch = searchSet.current.size > 0
    const isHighlighted = (n) => {
      if (hovered) {
        return n._id === hovered._id || hoveredNeighbors?.has(n._id)
      }
      if (hasSearch) return searchSet.current.has(n._id)
      return true
    }

    // Edges
    ctx.lineWidth = 0.3
    edges.forEach((e) => {
      const s = e.source
      const tgt = e.target
      if (!s.x || !tgt.x) return

      const sHi = isHighlighted(s)
      const tHi = isHighlighted(tgt)
      const active = sHi && tHi

      ctx.strokeStyle = active
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(255,255,255,0.02)'
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.stroke()
    })

    // Nodes
    nodes.forEach((n) => {
      if (!n.x) return
      const hi = isHighlighted(n)
      const isHovered = hovered && n._id === hovered._id
      const r = isHovered ? HOVER_RADIUS : NODE_RADIUS

      ctx.globalAlpha = hi ? 1 : 0.08
      ctx.fillStyle = getColor(n)
      ctx.beginPath()
      ctx.arc(n.x, n.y, r / t.k, 0, Math.PI * 2)
      ctx.fill()

      if (isHovered) {
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
        ctx.fillText(n.name, n.x + (NODE_RADIUS + 3) / t.k, n.y)
      })
    }

    ctx.restore()
  }, [nodes, edges, getColor, visibleEras, timeExtent])

  // ─── SIMULATION ─────────────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return

    const canvas = canvasRef.current
    const width = canvas.parentElement.clientWidth
    const height = canvas.parentElement.clientHeight
    canvas.width = width
    canvas.height = height

    const graphHeight = height - AXIS_HEIGHT

    // Build piecewise time scale: year → x pixel (equal width per era)
    const timeScale = buildTimeScale(TIMELINE_PADDING, width - TIMELINE_PADDING)

    timeScaleRef.current = timeScale

    // Stop any existing simulation
    simRef.current?.stop()

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((d) => d._id)
          .distance(60)
          .strength(0.3),
      )
      .force('charge', d3.forceManyBody().strength(-30).distanceMax(300))
      // Weak horizontal pull toward year position
      .force('x', d3.forceX((d) => timeScale(d.year)).strength(0.15))
      // Vertical centering within the graph area (above the axis)
      .force('y', d3.forceY(graphHeight / 2).strength(0.05))
      .force('collision', d3.forceCollide(NODE_RADIUS + 1))
      .alphaDecay(0.02)
      .velocityDecay(0.4)

    let tickCount = 0
    sim.on('tick', () => {
      tickCount++
      if (tickCount > 300 || sim.alpha() < 0.01) {
        sim.stop()
      }
      draw()
    })

    simRef.current = sim

    // ─── ZOOM ───────────────────────────────────────────────
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        transformRef.current = event.transform
        draw()
      })

    const sel = d3.select(canvas)
    sel.call(zoom)

    // ─── MOUSE INTERACTION ──────────────────────────────────
    const quadtree = d3
      .quadtree()
      .x((d) => d.x)
      .y((d) => d.y)

    const findNode = (mx, my) => {
      const t = transformRef.current
      const x = (mx - t.x) / t.k
      const y = (my - t.y) / t.k
      const radius = 12 / t.k
      quadtree.removeAll(quadtree.data())
      quadtree.addAll(nodes.filter((n) => n.x !== undefined))
      return quadtree.find(x, y, radius)
    }

    const handleMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const found = findNode(mx, my)

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
        draw()
      }
    }

    const handleClick = (event) => {
      const rect = canvas.getBoundingClientRect()
      const found = findNode(
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
      if (found && onNodeClick) onNodeClick(found._id)
    }

    canvas.addEventListener('mousemove', handleMove)
    canvas.addEventListener('click', handleClick)

    // ─── RESIZE ─────────────────────────────────────────────
    const resizeObs = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect
      canvas.width = w
      canvas.height = h

      // Rebuild piecewise scale for new width
      const newScale = buildTimeScale(TIMELINE_PADDING, w - TIMELINE_PADDING)
      timeScaleRef.current = newScale

      // Update forces with new dimensions
      const newGraphHeight = h - AXIS_HEIGHT
      sim.force('x', d3.forceX((d) => newScale(d.year)).strength(0.15))
      sim.force('y', d3.forceY(newGraphHeight / 2).strength(0.05))
      sim.alpha(0.3).restart()
    })
    resizeObs.observe(canvas.parentElement)

    return () => {
      sim.stop()
      canvas.removeEventListener('mousemove', handleMove)
      canvas.removeEventListener('click', handleClick)
      resizeObs.disconnect()
    }
  }, [nodes, edges, draw, onNodeClick, timeExtent, buildTimeScale])

  // Redraw when colorBy or search changes (no sim restart needed)
  useEffect(() => {
    draw()
  }, [colorBy, searchTerm, draw])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
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
            {tooltip.node.yearDisplay || tooltip.node.year} · {tooltip.node.era}
          </div>
          <div style={{ color: '#888', fontSize: 11 }}>
            {tooltip.node.category}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ForceGraph)
