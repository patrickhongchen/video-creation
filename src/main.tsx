import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ExportRenderSurface } from './components/ExportRenderSurface'
import './styles.css'

const isExportRenderer = new URLSearchParams(window.location.search).get('mode') === 'export-render'

createRoot(document.getElementById('root')!).render(isExportRenderer
  ? <ExportRenderSurface />
  : <StrictMode><App /></StrictMode>)
