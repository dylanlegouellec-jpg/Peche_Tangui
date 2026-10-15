import { createContext, useContext, useSyncExternalStore } from 'react'
import { DEFAULT_FX, type Fx, type Look, type Motion } from './types'

export interface LookState {
  look: Look
  /** Niveau effectif : tient compte du réglage « Réduire les animations » du téléphone. */
  motion: Motion
  fx: Fx
  dark: boolean
}

export const LookContext = createContext<LookState>({ look: 'ocean', motion: 'full', fx: DEFAULT_FX, dark: false })
export const useLook = () => useContext(LookContext)

const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null)
const subscribeMq = (q: string) => (cb: () => void) => {
  const m = mq(q)
  m?.addEventListener('change', cb)
  return () => m?.removeEventListener('change', cb)
}
const reduceQ = '(prefers-reduced-motion: reduce)'
const darkQ = '(prefers-color-scheme: dark)'
const subReduce = subscribeMq(reduceQ)
const subDark = subscribeMq(darkQ)
export const useReducedMotion = () => useSyncExternalStore(subReduce, () => !!mq(reduceQ)?.matches)
export const useSystemDark = () => useSyncExternalStore(subDark, () => !!mq(darkQ)?.matches)

/** Exécute `fn` à chaque image (requestAnimationFrame) à `fps` images/s au plus, en pause quand l'appli est masquée. Renvoie l'arrêt. */
export function loop(fn: (t: number) => void, fps = 30): () => void {
  let id = 0
  let last = 0
  let stopped = false
  const step = (t: number) => {
    if (stopped) return
    id = requestAnimationFrame(step)
    if (document.hidden || t - last < 1000 / fps - 2) return
    last = t
    fn(t)
  }
  id = requestAnimationFrame(step)
  return () => {
    stopped = true
    cancelAnimationFrame(id)
  }
}
