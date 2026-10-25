import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initBackend } from './backend'
import './index.css'

initBackend().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
