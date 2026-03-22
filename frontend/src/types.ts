// ── Domain Enums (as const unions, mirroring backend) ─────────

export type Era =
  | 'Prehistoric'
  | 'Neolithic'
  | 'Ancient'
  | 'Classical'
  | 'Medieval'
  | 'Early Modern'
  | 'Industrial'
  | 'Modern'
  | 'Information'

export type Category =
  | 'Anthropology'
  | 'Archaeology'
  | 'Astronomy'
  | 'Biology'
  | 'Chemistry'
  | 'Communication'
  | 'Computers'
  | 'Construction'
  | 'Earth science'
  | 'Electronics'
  | 'Energy'
  | 'Food & agriculture'
  | 'Materials'
  | 'Mathematics'
  | 'Medicine & health'
  | 'Physics'
  | 'Tools'
  | 'Transportation'

export type RelationType =
  | 'related_to'
  | 'led_to'
  | 'enabled'
  | 'improved'
  | 'required'
  | 'inspired'

// ── Graph Node Types ──────────────────────────────────────────

export interface TechNode {
  _id: string
  name: string
  year: number
  yearDisplay: string
  era: Era
  category: Category
  region?: string | null
  person?: string | null
  // D3 simulation adds these at runtime
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  index?: number
}

export interface PersonNode {
  _id: string
  name: string
  year: number
  yearDisplay: string
  era: Era
  category: Category
  contributionCount: number
  // D3 simulation fields
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  index?: number
}

export type GraphNode = TechNode | PersonNode

// ── Graph Edge Types ──────────────────────────────────────────

export interface TechEdge {
  source: string | TechNode
  target: string | TechNode
  type: RelationType
}

export interface PersonEdge {
  source: string | PersonNode
  target: string | PersonNode
  weight: number
}

export type GraphEdge = TechEdge | PersonEdge

// ── API Response Types ────────────────────────────────────────

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: { nodeCount: number; edgeCount: number } | null
}

export interface TechDetailData {
  _id: string
  name: string
  year: number
  yearDisplay: string
  era: Era
  category: Category
  tags: string[]
  description: string
  region: string | null
  person: string | null
}

export interface RelationData {
  from: { _id: string; name: string; year: number; yearDisplay: string; category: Category }
  to: { _id: string; name: string; year: number; yearDisplay: string; category: Category }
  type: RelationType
  fromYear?: number
  toYear?: number
}

export interface PersonDetailData {
  name: string
  activeFrom: number
  activeTo: number
  eras: Era[]
  categories: Category[]
  regions: string[]
  tags: string[]
  contributionCount: number
  wikipediaUrl: string | null
  thumbnailUrl: string | null
}

export interface ContributionData {
  _id: string
  name: string
  year: number
  yearDisplay: string
  era: Era
  category: Category
  description: string
}

export interface StatsData {
  technologies: number
  relations: number
  byEra: Record<string, number>
  byCategory: Record<string, number>
  eras: Era[]
  categories: Category[]
}

export interface SearchResultTech {
  _id: string
  name: string
  yearDisplay: string
  category: Category
}

export interface SearchResultPerson {
  name: string
  contributionCount: number
  era: Era
  category: Category
  yearDisplay: string
}

// ── UI State Types ────────────────────────────────────────────

export interface Filters {
  era: Era | ''
  category: Category | ''
}

export type ViewMode = 'technology' | 'person'
export type ColorBy = 'era' | 'category'

export interface RecentItem {
  id: string
  name: string
  yearDisplay: string
  category: Category
  type: 'technology' | 'person'
  timestamp: number
}

export interface EraBoundary {
  era: Era
  start: number
  end: number
}
