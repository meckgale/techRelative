import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../utils/constants';

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

export function useTechDetail(id) {
  const [tech, setTech] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setTech(null); return; }
    setLoading(true);
    fetch(`${API_BASE}/technologies/${id}`)
      .then(r => r.json())
      .then(data => { setTech(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  return { tech, loading };
}
