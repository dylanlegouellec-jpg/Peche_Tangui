import { useEffect, useState } from 'react'
import { useLook } from '../../lib/look'

type Party = { id: number; kind: 'catch' | 'record'; text: string }
const listeners = new Set<(p: Party) => void>()
let seq = 0

/** Déclenche une célébration : poisson qui saute (prise) ou bulles et bandeau (record). */
export function celebrate(kind: Party['kind'], text: string) {
  const p = { id: ++seq, kind, text }
  listeners.forEach((l) => l(p))
}

export function Celebrations() {
  const { motion, fx, look } = useLook()
  const [party, setParty] = useState<Party | null>(null)
  useEffect(() => {
    const l = (p: Party) => setParty(p)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  useEffect(() => {
    if (!party) return
    const t = setTimeout(() => setParty(null), party.kind === 'record' ? 2600 : 1800)
    return () => clearTimeout(t)
  }, [party])
  if (!party || motion === 'off' || !fx.celebrate) return null
  return (
    <div className={`celebrate ${party.kind} ${look}`} key={party.id} aria-live="polite">
      {party.kind === 'record' && <div className="bubbles">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 90}ms`, ['--s' as string]: `${8 + ((i * 7) % 18)}px` }} />)}</div>}
      <svg className="jump" viewBox="0 0 200 120" aria-hidden="true">
        <path className="splashline" d="M20 100 q20 -8 40 0 t40 0 t40 0 t40 0" />
        <g className="fish">
          <path d="M0 0 q14 -11 30 0 q-16 11 -30 0z" />
          <path d="M28 0 l10 -8 v16z" />
          <circle cx="7" cy="-2" r="1.6" className="eye" />
        </g>
      </svg>
      <div className="party-text">{party.text}</div>
    </div>
  )
}
