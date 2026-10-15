import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLook } from '../../lib/look'

const THRESHOLD = 80

/**
 * Tirer pour actualiser : en haut de la page, tirer vers le bas remplit une vague ; au-delà du seuil, la relâcher lance l'actualisation.
 * (Le rebond natif d'iOS est désactivé dans l'appli : on gère le geste nous-mêmes.)
 */
export function PullRefresh({ scroller, onRefresh, enabled }: { scroller: RefObject<HTMLElement | null>; onRefresh: () => void; enabled: boolean }) {
  const { motion } = useLook()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  const cur = useRef(0)

  useEffect(() => {
    const el = scroller.current
    if (!el || !enabled) return
    const down = (e: TouchEvent) => {
      start.current = el.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null
    }
    const move = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || el.scrollTop > 0) return setPull((cur.current = 0))
      cur.current = Math.min(130, dy * 0.55)
      setPull(cur.current)
    }
    const up = () => {
      if (start.current == null) return
      start.current = null
      if (cur.current >= THRESHOLD) {
        setBusy(true)
        onRefresh()
        setTimeout(() => setBusy(false), 1200)
      }
      setPull((cur.current = 0))
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [scroller, onRefresh, enabled])

  if (!enabled || (!pull && !busy)) return null
  const k = busy ? 1 : Math.min(1, pull / THRESHOLD)
  return (
    <div className={`pull ${busy ? 'busy' : ''} ${motion === 'full' ? 'anim' : ''}`} style={{ height: busy ? 56 : pull }} aria-hidden="true">
      <div className="pull-glass">
        <div className="pull-water" style={{ transform: `translateY(${(1 - k) * 100}%)` }} />
        <span>{busy ? '↻' : k >= 1 ? '↑' : '↓'}</span>
      </div>
      <span className="muted small">{busy ? 'Actualisation…' : k >= 1 ? 'Relâche pour actualiser' : 'Tire pour actualiser'}</span>
    </div>
  )
}
