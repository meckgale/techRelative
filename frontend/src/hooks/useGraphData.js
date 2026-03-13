import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { API_BASE } from '../utils/constants';

function detailReducer(state, action) {
  switch (action.type) {
    case 'loading': return { ...state, loading: true, error: null };
    case 'success': return { tech: action.tech, relations: action.relations, loading: false, error: null };
    case 'error': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useGraphData(filters) {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [], meta: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchGraph = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.era) params.set('era', filters.era);
    if (filters.category) params.set('category', filters.category);

    try {
      const res = await fetch(`${API_BASE}/graph?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setGraphData(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        console.error('Graph fetch failed:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [filters.era, filters.category]);

  useEffect(() => {
    fetchGraph();
    return () => abortRef.current?.abort();
  }, [fetchGraph]);

  return { graphData, loading, error, refetch: fetchGraph };
}

export function useStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  return stats;
}

const detailInitial = { tech: null, relations: [], loading: false, error: null };

export function useTechDetail(id) {
  const [state, dispatch] = useReducer(detailReducer, detailInitial);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    dispatch({ type: 'loading' });
    fetch(`${API_BASE}/technologies/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!cancelled) dispatch({ type: 'success', tech: data.technology, relations: data.relations || [] });
      })
      .catch(err => {
        if (!cancelled) dispatch({ type: 'error', error: err.message });
      });
    return () => { cancelled = true; };
  }, [id]);

  if (!id) return detailInitial;
  return state;
}
