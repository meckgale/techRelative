import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { API_BASE } from '../utils/constants'
import { fetchWithRetry, friendlyError } from '../utils/fetchWithRetry'
import type {
  Filters,
  ViewMode,
  GraphData,
  TechDetailData,
  RelationData,
  PersonDetailData,
  ContributionData,
  StatsData,
} from '../types'

// ── Tech Detail ───────────────────────────────────────────────

interface DetailState {
  tech: TechDetailData | null
  relations: RelationData[]
  loading: boolean
  error: string | null
}

type DetailAction =
  | { type: 'loading' }
  | { type: 'success'; tech: TechDetailData; relations: RelationData[] }
  | { type: 'error'; error: string }

export const detailInitial: DetailState = { tech: null, relations: [], loading: false, error: null }

export function detailReducer(state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case 'loading': return { ...state, loading: true, error: null }
    case 'success': return { tech: action.tech, relations: action.relations, loading: false, error: null }
    case 'error': return { ...state, loading: false, error: action.error }
  }
}

// ── Person Detail ─────────────────────────────────────────────

interface PersonState {
  person: PersonDetailData | null
  contributions: ContributionData[]
  loading: boolean
  error: string | null
}

type PersonAction =
  | { type: 'loading' }
  | { type: 'success'; person: PersonDetailData; contributions: ContributionData[] }
  | { type: 'error'; error: string }

export const personInitial: PersonState = { person: null, contributions: [], loading: false, error: null }

export function personReducer(state: PersonState, action: PersonAction): PersonState {
  switch (action.type) {
    case 'loading': return { ...state, loading: true, error: null }
    case 'success': return { person: action.person, contributions: action.contributions, loading: false, error: null }
    case 'error': return { ...state, loading: false, error: action.error }
  }
}

// ── Hooks ─────────────────────────────────────────────────────

export function useGraphData(filters: Filters, mode: ViewMode = 'technology') {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], meta: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const endpoint = mode === 'person' ? 'persons-graph' : 'graph'

  const fetchGraph = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setGraphData({ nodes: [], edges: [], meta: null })
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (filters.era) params.set('era', filters.era)
    if (filters.category) params.set('category', filters.category)

    try {
      const res = await fetchWithRetry(`${API_BASE}/${endpoint}?${params}`, {
        signal: controller.signal,
      })
      const data = await res.json()
      setGraphData(data)
      setLoading(false)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(friendlyError(err))
      setLoading(false)
    }
  }, [filters.era, filters.category, endpoint])

  useEffect(() => {
    fetchGraph()
    return () => abortRef.current?.abort()
  }, [fetchGraph])

  return { graphData, loading, error, refetch: fetchGraph }
}

export function useStats() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWithRetry(`${API_BASE}/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(err => setError(friendlyError(err)))
  }, [])

  return { stats, error }
}

export function usePersonDetail(name: string | null) {
  const [state, dispatch] = useReducer(personReducer, personInitial)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    dispatch({ type: 'loading' })
    fetchWithRetry(`${API_BASE}/persons/${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) dispatch({ type: 'success', person: data.person, contributions: data.contributions || [] })
      })
      .catch(err => {
        if (!cancelled) dispatch({ type: 'error', error: friendlyError(err) })
      })
    return () => { cancelled = true }
  }, [name, retryCount])

  if (!name) return { ...personInitial, retry: () => {} }
  return { ...state, retry: () => setRetryCount(c => c + 1) }
}

export function useTechDetail(id: string | null) {
  const [state, dispatch] = useReducer(detailReducer, detailInitial)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    dispatch({ type: 'loading' })
    fetchWithRetry(`${API_BASE}/technologies/${id}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) dispatch({ type: 'success', tech: data.technology, relations: data.relations || [] })
      })
      .catch(err => {
        if (!cancelled) dispatch({ type: 'error', error: friendlyError(err) })
      })
    return () => { cancelled = true }
  }, [id, retryCount])

  if (!id) return { ...detailInitial, retry: () => {} }
  return { ...state, retry: () => setRetryCount(c => c + 1) }
}
