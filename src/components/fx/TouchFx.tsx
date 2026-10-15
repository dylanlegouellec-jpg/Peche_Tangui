import { useEffect } from 'react'
import { useLook } from '../../lib/look'

/** Effet au toucher selon le style : bioluminescence (océan, de nuit ou en sombre), onde de lumière (verre), goutte d'encre (carnet). */
export function TouchFx() {
  const { look, motion, fx, dark } = useLook()
  useEffect(() => {
    if (motion !== 'full' || !fx.touch) return
    const layer = document.createElement('div')
    layer.className = 'touchfx'
    document.body.appendChild(layer)
    const onDown = (e: PointerEvent) => {
      const kind = look === 'glass' ? 'ripple' : look === 'logbook' ? 'ink' : dark ? 'glow' : 'drop'
      const n = kind === 'glow' ? 7 : 1
      for (let i = 0; i < n; i++) {
        const el = document.createElement('i')
        el.className = `tfx ${kind}`
        const dx = kind === 'glow' ? (Math.random() - 0.5) * 44 : 0
        const dy = kind === 'glow' ? (Math.random() - 0.5) * 44 : 0
        el.style.left = `${e.clientX + dx}px`
        el.style.top = `${e.clientY + dy}px`
        el.style.animationDelay = `${i * 40}ms`
        layer.appendChild(el)
        setTimeout(() => el.remove(), 1300)
      }
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown)
      layer.remove()
    }
  }, [look, motion, fx.touch, dark])
  return null
}
