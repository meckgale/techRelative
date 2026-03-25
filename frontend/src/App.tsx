import { useEffect, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar/Sidebar'
import WelcomeModal from './components/WelcomeModal/WelcomeModal'
import { useGraphData } from './hooks/useGraphData'
import { useDebounce } from './hooks/useDebounce'
import { useAppStore } from './store/useAppStore'
import { useAutoSelect } from './hooks/useAutoSelect'
import './styles/app.css'

const ForceGraph = lazy(() => import('./components/Graph/ForceGraph'))
const TechDetail = lazy(() => import('./components/TechDetail/TechDetail'))
const PersonDetail = lazy(() => import('./components/PersonDetail/PersonDetail'))

export default function App() {
  const filters = useAppStore((s) => s.filters)
  const viewMode = useAppStore((s) => s.viewMode)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const selectedId = useAppStore((s) => s.selectedId)
  const selectedPerson = useAppStore((s) => s.selectedPerson)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const closeSidebar = useAppStore((s) => s.closeSidebar)

  useAutoSelect()

  // Close sidebar when resizing above mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = () => { if (!mq.matches) closeSidebar() }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [closeSidebar])

  const debouncedFilters = useDebounce(filters, 300)
  const { graphData, loading, error, refetch } = useGraphData(debouncedFilters, viewMode)

  return (
    <div className="app-layout">
      <div className="app-main">
        <WelcomeModal />
        {!sidebarOpen && (
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label="Open sidebar"
          >
            ☰
          </button>
        )}

        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={closeSidebar}
        />

        <Sidebar
          nodeCount={graphData.nodes.length}
          edgeCount={graphData.edges.length}
          loading={loading}
        />

        <main className="graph-container">
          {error && (
            <div className="error-banner">
              Failed to load graph: {error}
              <button className="retry-btn" onClick={refetch}>Retry</button>
            </div>
          )}

          <Suspense fallback={<div>Loading graph...</div>}>
            <ForceGraph
              nodes={graphData.nodes}
              edges={graphData.edges}
              loading={loading}
            />
          </Suspense>

          <Suspense fallback={<div>Loading details...</div>}>
            {selectedPerson ? (
              <PersonDetail onBack={!!selectedId} />
            ) : (
              <TechDetail />
            )}
          </Suspense>
        </main>
      </div>

      <footer className="site-footer">
        <p>
          <strong>Data sources:</strong> Technology relationships and historical
          data were derived from <a href="https://archive.org/details/historyofscience00bunc" target="_blank" rel="noopener noreferrer"><em>"The History of Science and Technology"</em></a>{' '}
          by <em>Bryan Bunch</em> and <em>Alexander Hellemans</em>. All descriptions have been
          independently paraphrased. Biographical links source from Wikipedia.
          This is a non-commercial, educational portfolio project and is not
          affiliated with or endorsed by the original authors or publisher.
        </p>
      </footer>
    </div>
  )
}
