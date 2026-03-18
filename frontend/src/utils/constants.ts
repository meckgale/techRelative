import type { Era, Category, EraBoundary } from '../types'

// 9 eras — must match backend/src/models/Technology.ts ERAS
export const ERA_COLORS: Record<Era, string> = {
  Prehistoric: '#A67C52',
  Neolithic: '#C9A84C',
  Ancient: '#D4883E',
  Classical: '#C2655A',
  Medieval: '#8B4F6E',
  'Early Modern': '#6B5B95',
  Industrial: '#4A7C8F',
  Modern: '#3A8FB7',
  Information: '#22B573',
}

// 18 categories — must match backend/src/models/Technology.ts CATEGORIES
export const CATEGORY_COLORS: Record<Category, string> = {
  Anthropology: '#8D6E63',
  Archaeology: '#A1887F',
  Astronomy: '#5C6BC0',
  Biology: '#66BB6A',
  Chemistry: '#EF6C00',
  Communication: '#7E57C2',
  Computers: '#1E88E5',
  Construction: '#78909C',
  'Earth science': '#546E7A',
  Electronics: '#AB47BC',
  Energy: '#FDD835',
  'Food & agriculture': '#7CB342',
  Materials: '#8D6E63',
  Mathematics: '#EC407A',
  'Medicine & health': '#EF5350',
  Physics: '#42A5F5',
  Tools: '#FF8A65',
  Transportation: '#0097A7',
}

export const ERAS = Object.keys(ERA_COLORS) as Era[]
export const CATEGORIES = Object.keys(CATEGORY_COLORS) as Category[]

// Approximate era boundaries (start year) for timeline rendering
// Negative = BCE, positive = CE
export const ERA_BOUNDARIES: EraBoundary[] = [
  { era: 'Prehistoric', start: -3000000, end: -10000 },
  { era: 'Neolithic', start: -10000, end: -3000 },
  { era: 'Ancient', start: -3000, end: -800 },
  { era: 'Classical', start: -800, end: 500 },
  { era: 'Medieval', start: 500, end: 1400 },
  { era: 'Early Modern', start: 1400, end: 1760 },
  { era: 'Industrial', start: 1760, end: 1920 },
  { era: 'Modern', start: 1920, end: 1970 },
  { era: 'Information', start: 1970, end: 2030 },
]

export const API_BASE = import.meta.env.VITE_API_BASE || '/api'
