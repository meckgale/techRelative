import * as d3 from 'd3'
import type { GraphNode, GraphEdge, ViewMode } from '../../types'

const NODE_RADIUS = 4
const HOVER_RADIUS = 8
const LABEL_THRESHOLD = 1.4
const AXIS_SIZE = 36

export { NODE_RADIUS }

interface HighlightState {
  selectedId: string | null
  selectedNeighbors: Set<string> | null | undefined
  hovered: GraphNode | null
  hoveredNeighbors: Set<string> | null | undefined
  searchMatches: Set<string>
}

interface DrawGraphContentParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  transform: d3.ZoomTransform
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewMode: ViewMode
  portrait: boolean
  highlight: HighlightState
  getColor: (node: GraphNode) => string
}

function isHighlighted(n: GraphNode, h: HighlightState): boolean {
  if (h.selectedId) {
    return n._id === h.selectedId || !!h.selectedNeighbors?.has(n._id)
  }
  if (h.hovered) {
    return n._id === h.hovered._id || !!h.hoveredNeighbors?.has(n._id)
  }
  if (h.searchMatches.size > 0) return h.searchMatches.has(n._id)
  return true
}

export function drawGraphContent({
  ctx,
  width,
  height,
  transform: t,
  nodes,
  edges,
  viewMode,
  portrait,
  highlight,
  getColor,
}: DrawGraphContentParams): void {
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

  // Edges
  edges.forEach((e) => {
    const s = e.source as GraphNode
    const tgt = e.target as GraphNode
    if (!s.x || !tgt.x) return

    const sHi = isHighlighted(s, highlight)
    const tHi = isHighlighted(tgt, highlight)
    const active = sHi && tHi

    if (highlight.selectedId && active) {
      ctx.strokeStyle = 'rgba(220,80,60,0.25)'
      ctx.lineWidth = 0.5
    } else if (active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 0.3
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.02)'
      ctx.lineWidth = 0.3
    }
    ctx.shadowBlur = 0
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
    const hi = isHighlighted(n, highlight)
    const isHov = highlight.hovered && n._id === highlight.hovered._id
    const isSel = highlight.selectedId && n._id === highlight.selectedId
    const r = isSel || isHov ? HOVER_RADIUS : NODE_RADIUS
    const sr = r / t.k

    ctx.globalAlpha = hi ? 1 : 0.04
    ctx.fillStyle = getColor(n)

    if (isPerson) {
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

    if (isSel) {
      ctx.shadowColor = getColor(n)
      ctx.shadowBlur = 12 / t.k
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / t.k
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    if (isHov && !isSel) {
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
      if (!isHighlighted(n, highlight)) return
      ctx.fillText(n.name, n.x + (NODE_RADIUS + 3) / t.k, n.y!)
    })
  }

  ctx.restore()
}
