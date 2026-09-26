import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PwaManager } from './app/PwaManager'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaManager />
  </StrictMode>,
)
