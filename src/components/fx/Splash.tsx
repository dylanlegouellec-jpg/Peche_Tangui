import { useEffect, useState } from 'react'
import { useLook } from '../../lib/look'

const KEY = 'peche-splash'

/** Au lancement (une fois par ouverture de l'appli) : un hameçon plonge dans l'eau, éclaboussure, puis l'écran s'efface. */
export function Splash() {
  const { motion, fx, look } = useLook()
  const [show, setShow] = useState(() => {
    try {
      return !sessionStorage.getItem(KEY)
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!show) return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* stockage indisponible */
    }
    const t = setTimeout(() => setShow(false), 1500)
    return () => clearTimeout(t)
  }, [show])
  if (!show || motion !== 'full' || !fx.splash) return null
  return (
    <div className={`splash ${look}`} aria-hidden="true" onClick={() => setShow(false)}>
      <svg viewBox="0 0 120 160">
        <line className="line" x1="60" y1="0" x2="60" y2="70" />
        <g className="hook">
          <path d="M60 70 v26 a12 12 0 1 1 -16 -11" fill="none" strokeWidth="5" strokeLinecap="round" />
          <path d="M44 85 l-3 -9 l8 4" fill="none" strokeWidth="4" strokeLinejoin="round" />
        </g>
        <path className="water" d="M0 100 q15 -6 30 0 t30 0 t30 0 t30 0 V160 H0z" />
        <circle className="ring r1" cx="60" cy="100" r="4" />
        <circle className="ring r2" cx="60" cy="100" r="4" />
        <g className="drops">
          <circle cx="60" cy="96" r="2.5" /><circle cx="60" cy="96" r="2" /><circle cx="60" cy="96" r="2" /><circle cx="60" cy="96" r="1.6" />
        </g>
      </svg>
      <div className="splash-title">Pêche</div>
    </div>
  )
}
