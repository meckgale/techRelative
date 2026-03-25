import * as d3 from 'd3'
import { ERA_COLORS } from '../../utils/constants'
import type { Era, EraBoundary } from '../../types'

const AXIS_SIZE = 36
const GRADIENT_WIDTH = 24

export { AXIS_SIZE }

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Precompute era color strings to avoid per-frame hex parsing
const eraFillCache = new Map<string, string>()
const eraGradCache = new Map<string, string>()
for (const [era, hex] of Object.entries(ERA_COLORS)) {
  eraFillCache.set(era, hexToRgba(hex, 0.04))
  eraGradCache.set(era, hexToRgba(hex, 0.06))
}

interface DrawEraAxisParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  transform: d3.ZoomTransform
  timeScale: d3.ScaleLinear<number, number>
  visibleEras: EraBoundary[]
  timeExtent: [number, number]
  portrait: boolean
}

export function drawEraAxis({
  ctx,
  width,
  height,
  transform: t,
  timeScale,
  visibleEras,
  timeExtent,
  portrait,
}: DrawEraAxisParams): void {
  if (portrait) {
    drawPortraitAxis(ctx, width, height, t, timeScale, visibleEras, timeExtent)
  } else {
    drawLandscapeAxis(ctx, width, height, t, timeScale, visibleEras, timeExtent)
  }
}

function drawPortraitAxis(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: d3.ZoomTransform,
  timeScale: d3.ScaleLinear<number, number>,
  visibleEras: EraBoundary[],
  timeExtent: [number, number],
): void {
  const graphLeft = AXIS_SIZE

  // Era bands with era-colored tint
  visibleEras.forEach((b) => {
    const yStart = t.y + t.k * timeScale(Math.max(b.start, timeExtent[0]))
    const yEnd = t.y + t.k * timeScale(Math.min(b.end, timeExtent[1]))
    const bh = yEnd - yStart
    if (yEnd < 0 || yStart > height) return

    ctx.fillStyle = eraFillCache.get(b.era) || 'rgba(102,102,102,0.04)'
    ctx.fillRect(graphLeft, yStart, width - graphLeft, bh)
  })

  // Gradient transitions at era boundaries
  for (let i = 1; i < visibleEras.length; i++) {
    const boundary = Math.max(visibleEras[i].start, timeExtent[0])
    const yPos = t.y + t.k * timeScale(boundary)
    if (yPos < -GRADIENT_WIDTH || yPos > height + GRADIENT_WIDTH) continue

    const grad = ctx.createLinearGradient(0, yPos - GRADIENT_WIDTH, 0, yPos + GRADIENT_WIDTH)
    grad.addColorStop(0, eraGradCache.get(visibleEras[i - 1].era) || 'transparent')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.03)')
    grad.addColorStop(1, eraGradCache.get(visibleEras[i].era) || 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(graphLeft, yPos - GRADIENT_WIDTH, width - graphLeft, GRADIENT_WIDTH * 2)
  }

  // Axis bar on left
  ctx.fillStyle = 'rgba(14, 16, 21, 0.95)'
  ctx.fillRect(0, 0, graphLeft, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(graphLeft, 0)
  ctx.lineTo(graphLeft, height)
  ctx.stroke()

  // Tick marks at era boundaries connecting axis to graph
  for (let i = 1; i < visibleEras.length; i++) {
    const boundary = Math.max(visibleEras[i].start, timeExtent[0])
    const yPos = t.y + t.k * timeScale(boundary)
    if (yPos < 0 || yPos > height) continue

    // Subtle tick extending from axis into graph area
    const tickGrad = ctx.createLinearGradient(graphLeft, 0, graphLeft + 24, 0)
    tickGrad.addColorStop(0, 'rgba(255,255,255,0.06)')
    tickGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = tickGrad
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(graphLeft, yPos)
    ctx.lineTo(graphLeft + 24, yPos)
    ctx.stroke()

    // Small tick inside axis bar
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.moveTo(graphLeft - 6, yPos)
    ctx.lineTo(graphLeft, yPos)
    ctx.stroke()
  }

  // Era labels (rotated vertically)
  ctx.font = '9px monospace'
  visibleEras.forEach((b) => {
    const yStart = t.y + t.k * timeScale(Math.max(b.start, timeExtent[0]))
    const yEnd = t.y + t.k * timeScale(Math.min(b.end, timeExtent[1]))
    const cy = (yStart + yEnd) / 2
    const bh = yEnd - yStart

    if (cy < -100 || cy > height + 100) return

    const eraColor = ERA_COLORS[b.era as Era] || '#666'

    if (bh >= 10) {
      ctx.fillStyle = eraColor
      ctx.beginPath()
      ctx.arc(graphLeft / 2, cy, 3, 0, Math.PI * 2)
      ctx.fill()
    }

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
}

function drawLandscapeAxis(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: d3.ZoomTransform,
  timeScale: d3.ScaleLinear<number, number>,
  visibleEras: EraBoundary[],
  timeExtent: [number, number],
): void {
  const graphBottom = height - AXIS_SIZE

  // Era bands with era-colored tint
  visibleEras.forEach((b) => {
    const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
    const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
    const bw = xEnd - xStart
    if (xEnd < 0 || xStart > width) return

    ctx.fillStyle = eraFillCache.get(b.era) || 'rgba(102,102,102,0.04)'
    ctx.fillRect(xStart, 0, bw, graphBottom)
  })

  // Gradient transitions at era boundaries
  for (let i = 1; i < visibleEras.length; i++) {
    const boundary = Math.max(visibleEras[i].start, timeExtent[0])
    const xPos = t.x + t.k * timeScale(boundary)
    if (xPos < -GRADIENT_WIDTH || xPos > width + GRADIENT_WIDTH) continue

    const grad = ctx.createLinearGradient(xPos - GRADIENT_WIDTH, 0, xPos + GRADIENT_WIDTH, 0)
    grad.addColorStop(0, eraGradCache.get(visibleEras[i - 1].era) || 'transparent')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.03)')
    grad.addColorStop(1, eraGradCache.get(visibleEras[i].era) || 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(xPos - GRADIENT_WIDTH, 0, GRADIENT_WIDTH * 2, graphBottom)
  }

  // Axis bar at bottom
  ctx.fillStyle = 'rgba(14, 16, 21, 0.95)'
  ctx.fillRect(0, graphBottom, width, AXIS_SIZE)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, graphBottom)
  ctx.lineTo(width, graphBottom)
  ctx.stroke()

  // Tick marks at era boundaries connecting axis to graph
  for (let i = 1; i < visibleEras.length; i++) {
    const boundary = Math.max(visibleEras[i].start, timeExtent[0])
    const xPos = t.x + t.k * timeScale(boundary)
    if (xPos < 0 || xPos > width) continue

    // Subtle tick extending from axis into graph area
    const tickGrad = ctx.createLinearGradient(0, graphBottom - 24, 0, graphBottom)
    tickGrad.addColorStop(0, 'rgba(255,255,255,0)')
    tickGrad.addColorStop(1, 'rgba(255,255,255,0.06)')
    ctx.strokeStyle = tickGrad
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(xPos, graphBottom - 24)
    ctx.lineTo(xPos, graphBottom)
    ctx.stroke()

    // Small tick below axis line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.moveTo(xPos, graphBottom)
    ctx.lineTo(xPos, graphBottom + 6)
    ctx.stroke()
  }

  // Era labels
  ctx.font = '10px monospace'
  const axisY = graphBottom + AXIS_SIZE / 2
  visibleEras.forEach((b) => {
    const xStart = t.x + t.k * timeScale(Math.max(b.start, timeExtent[0]))
    const xEnd = t.x + t.k * timeScale(Math.min(b.end, timeExtent[1]))
    const cx = (xStart + xEnd) / 2
    const bw = xEnd - xStart

    if (cx < -100 || cx > width + 100) return

    const eraColor = ERA_COLORS[b.era as Era] || '#666'

    if (bw >= 10) {
      ctx.fillStyle = eraColor
      ctx.beginPath()
      ctx.arc(cx, axisY, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    const labelLen = ctx.measureText(b.era).width + 14
    if (bw >= labelLen) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(b.era, cx + 6, axisY)
    }
  })
}
