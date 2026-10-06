import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Mise à jour : l'appli cherche une nouvelle version au retour au premier plan et toutes les 30 min.
registerSW({
  immediate: true,
  onRegisteredSW: (_url, reg) => {
    if (!reg) return
    const check = () => void reg.update().catch(() => undefined)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 30 * 60 * 1000)
  },
})

// Comportement « vraie appli » : pas de zoom, pas de menu contextuel, pas de pincement.
// iOS ignore user-scalable=no, donc on bloque aussi les gestes à la main.
type PinchEvent = TouchEvent & { scale?: number }
const stop = (e: Event) => e.preventDefault()
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop)
document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false })
document.addEventListener('touchstart', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false })
document.addEventListener('touchmove', (e) => (e as PinchEvent).scale !== undefined && (e as PinchEvent).scale !== 1 && e.preventDefault(), { passive: false })
document.addEventListener('contextmenu', (e) => !(e.target instanceof HTMLElement && e.target.closest('input, textarea')) && e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
