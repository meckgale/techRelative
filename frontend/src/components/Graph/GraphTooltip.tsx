import type { GraphNode } from '../../types'

export interface TooltipState {
  x: number
  y: number
  node: GraphNode
}

interface GraphTooltipProps {
  tooltip: TooltipState
  getColor: (node: GraphNode) => string
}

export default function GraphTooltip({ tooltip, getColor }: GraphTooltipProps) {
  const tooltipWidth = 280
  const tooltipHeight = 60
  const margin = 8

  let left = tooltip.x + 14
  let top = tooltip.y - 10

  // Flip to the left side if it would overflow the right edge
  if (left + tooltipWidth + margin > window.innerWidth) {
    left = tooltip.x - tooltipWidth - 14
  }
  // Clamp to left edge
  if (left < margin) {
    left = margin
  }
  // Clamp to bottom edge
  if (top + tooltipHeight + margin > window.innerHeight) {
    top = window.innerHeight - tooltipHeight - margin
  }
  // Clamp to top edge
  if (top < margin) {
    top = margin
  }

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        background: 'rgba(15, 15, 20, 0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        padding: '8px 12px',
        pointerEvents: 'none',
        zIndex: 100,
        maxWidth: tooltipWidth,
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
  )
}
