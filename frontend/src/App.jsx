import { useState, useCallback, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar/Sidebar'
import { useGraphData } from './hooks/useGraphData'
import { useDebounce } from './hooks/useDebounce'
import './styles/app.css'

const ForceGraph = lazy(() => import('./components/Graph/ForceGraph'))
const TechDetail = lazy(() => import('./components/TechDetail/TechDetail'))

export default function App() {
  const [filters, setFilters] = useState({ era: '', category: '' })
  const [colorBy, setColorBy] = useState('era')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const debouncedFilters = useDebounce(filters, 300)
  const { graphData, loading, error } = useGraphData(debouncedFilters)

  const handleNodeClick = useCallback((id) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <div className="app-layout">
      <Sidebar
        filters={filters}
        onFilterChange={setFilters}
        colorBy={colorBy}
        onColorByChange={setColorBy}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        nodeCount={graphData.nodes.length}
        edgeCount={graphData.edges.length}
        loading={loading}
      />

      <main className="graph-container">
        {error && (
          <div className="error-banner">Failed to load graph: {error}</div>
        )}

        <Suspense fallback={<div>Loading graph...</div>}>
          <ForceGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            colorBy={colorBy}
            onNodeClick={handleNodeClick}
            selectedId={selectedId}
            searchTerm={searchTerm}
          />
        </Suspense>

        <Suspense fallback={<div>Loading details...</div>}>
          <TechDetail
            techId={selectedId}
            onClose={() => setSelectedId(null)}
            onNavigate={setSelectedId}
          />
        </Suspense>
      </main>
    </div>
  )
}
