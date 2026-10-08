import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// index.html must contain <div id="root">; fail loudly instead of asserting it exists.
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Brak elementu #root w index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
