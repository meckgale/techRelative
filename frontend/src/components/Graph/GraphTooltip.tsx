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
  return (
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
  )
}
