import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar/Sidebar'
import { useGraphData } from './hooks/useGraphData'
import { useDebounce } from './hooks/useDebounce'
import type { Filters, ViewMode, ColorBy } from './types'
import './styles/app.css'

const ForceGraph = lazy(() => import('./components/Graph/ForceGraph'))
const TechDetail = lazy(() => import('./components/TechDetail/TechDetail'))
const PersonDetail = lazy(() => import('./components/PersonDetail/PersonDetail'))


export default function App() {
  const [filters, setFilters] = useState<Filters>({ era: '', category: '' })
  const [colorBy, setColorBy] = useState<ColorBy>('era')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('technology')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar when resizing above mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = () => { if (!mq.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const debouncedFilters = useDebounce(filters, 300)
  const { graphData, loading, error } = useGraphData(debouncedFilters, viewMode)

  const handleNodeClick = useCallback((id: string) => {
    if (viewMode === 'person') {
      setSelectedPerson((prev) => (prev === id ? null : id))
      setSelectedId(null)
    } else {
      setSelectedId((prev) => (prev === id ? null : id))
      setSelectedPerson(null)
    }
    closeSidebar()
  }, [viewMode, closeSidebar])

  const handleFilterChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters)
    setSelectedId(null)
    setSelectedPerson(null)
    closeSidebar()
  }, [closeSidebar])

  const handlePersonClick = useCallback((name: string) => {
    setSelectedPerson(name)
  }, [])

  const handleBackToTech = useCallback(() => {
    setSelectedPerson(null)
  }, [])

  const handlePersonNavigateTech = useCallback((techId: string) => {
    setSelectedPerson(null)
    setSelectedId(techId)
  }, [])

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    setSelectedId(null)
    setSelectedPerson(null)
    setSearchTerm('')
  }, [])

  return (
    <div className="app-layout">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={closeSidebar}
      />

      <Sidebar
        filters={filters}
        onFilterChange={handleFilterChange}
        colorBy={colorBy}
        onColorByChange={setColorBy}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSelectTech={handleNodeClick}
        onSelectPerson={handlePersonClick}
        nodeCount={graphData.nodes.length}
        edgeCount={graphData.edges.length}
        loading={loading}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isOpen={sidebarOpen}
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
            selectedId={viewMode === 'person' ? selectedPerson : selectedId}
            searchTerm={searchTerm}
            viewMode={viewMode}
            loading={loading}
          />
        </Suspense>

        <Suspense fallback={<div>Loading details...</div>}>
          {selectedPerson ? (
            <PersonDetail
              personName={selectedPerson}
              onClose={() => { setSelectedPerson(null); setSelectedId(null) }}
              onNavigateTech={handlePersonNavigateTech}
              onBack={selectedId ? handleBackToTech : null}
            />
          ) : (
            <TechDetail
              techId={selectedId}
              onClose={() => setSelectedId(null)}
              onNavigate={setSelectedId}
              onPersonClick={handlePersonClick}
            />
          )}
        </Suspense>
      </main>
    </div>
  )
}
