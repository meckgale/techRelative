import * as d3 from 'd3'
import { ERA_COLORS } from '../../utils/constants'
import type { Era, EraBoundary } from '../../types'

const AXIS_SIZE = 36

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

export { AXIS_SIZE }

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

  // Era bands
  visibleEras.forEach((b, i) => {
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

  // Era bands
  visibleEras.forEach((b, i) => {
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
