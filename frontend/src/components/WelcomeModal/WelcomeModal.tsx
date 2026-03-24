import { useState } from 'react'
import './WelcomeModal.css'

const STORAGE_KEY = 'techrelative-welcome-dismissed'

export default function WelcomeModal() {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY)
  )

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="welcome-backdrop" onClick={dismiss}>
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="welcome-title">
          tech<span className="welcome-accent">Relative</span>
        </h2>
        <p className="welcome-subtitle">
          An interactive map of how technologies shaped each other across history.
        </p>

        <div className="welcome-steps">
          <div className="welcome-step">
            <span className="welcome-step-dot" />
            <div>
              <strong>Explore</strong>
              <span>Pan and zoom the graph to navigate 6,500+ technologies laid out on a timeline.</span>
            </div>
          </div>
          <div className="welcome-step">
            <span className="welcome-step-dot" />
            <div>
              <strong>Select</strong>
              <span>Click any node to see its details, description, and connections.</span>
            </div>
          </div>
          <div className="welcome-step">
            <span className="welcome-step-dot" />
            <div>
              <strong>Filter</strong>
              <span>Use the sidebar to search, filter by era or category, and switch between technology and person views.</span>
            </div>
          </div>
        </div>

        <button className="welcome-dismiss" onClick={dismiss}>
          Start exploring
        </button>
      </div>
    </div>
  )
}
