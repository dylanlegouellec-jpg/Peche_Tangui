import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import './styles/look.css'
import { installDiagnostics } from './lib/diagnostics'
import { whenNotEditing } from './lib/editing'

installDiagnostics()

// Mise à jour : l'appli cherche une nouvelle version au retour au premier plan et toutes les 30 min.
// Quand elle est prête, la page est rechargée, mais jamais pendant une saisie (formulaire ouvert ou champ actif).
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
let reloading = false
function reloadWhenSafe() {
  if (reloading) return
  whenNotEditing(() => {
    if (typing()) return void document.addEventListener('focusout', reloadWhenSafe, { once: true })
    reloading = true
    try {
      sessionStorage.setItem('peche-updated', '1')
    } catch {
      /* stockage indisponible */
    }
    location.reload()
  })
}
registerSW({
  immediate: true,
  onNeedReload: reloadWhenSafe,
  onRegisteredSW: (_url, reg) => {
    if (!reg) return
    const check = () => void reg.update().catch(() => undefined)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 30 * 60 * 1000)
  },
})

// Demande au navigateur de ne pas effacer les données de l'appli (Safari peut sinon les purger après 7 jours sans visite).
void navigator.storage?.persist?.().catch(() => undefined)

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
