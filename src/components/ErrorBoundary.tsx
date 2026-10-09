import { Component, type ReactNode } from 'react'

// Last line of defence: an unexpected rendering error shows a message instead of a blank page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app">
        <div className="error" role="alert">
          <p>Coś poszło nie tak po stronie aplikacji. Odśwież stronę i spróbuj ponownie.</p>
        </div>
      </main>
    )
  }
}
