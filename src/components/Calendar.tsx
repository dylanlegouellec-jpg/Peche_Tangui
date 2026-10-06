import { useState } from 'react'
import { createPortal } from 'react-dom'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

interface Props {
  value: string
  min: string
  /** Dernier jour avec prévisions détaillées. */
  lastForecast: string
  /** Score (0-100) des jours prévus, pour colorer les pastilles. */
  scores: Record<string, number>
  onPick: (k: string) => void
  onClose: () => void
}

/** Calendrier en feuille du bas : n'importe quel jour futur, avec les jours prévus en couleur. */
export function Calendar({ value, min, lastForecast, scores, onPick, onClose }: Props) {
  const [y0, m0] = value.split('-').map(Number)
  const [view, setView] = useState({ y: y0, m: m0 - 1 })
  const first = new Date(Date.UTC(view.y, view.m, 1))
  const offset = (first.getUTCDay() + 6) % 7 // lundi en premier
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const [minY, minM] = min.split('-').map(Number)
  const canPrev = view.y > minY || (view.y === minY && view.m > minM - 1)
  const shift = (n: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }))
  const tone = (s: number) => (s >= 70 ? 'good' : s >= 45 ? 'mid' : 'bad')

  // Portail : un parent animé (transform) ferait de position: fixed un repère local, la feuille sortirait de l'écran.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Choisir un jour" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="row between">
          <button className="mini" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mois précédent">‹</button>
          <strong>{MONTHS[view.m]} {view.y}</strong>
          <button className="mini" onClick={() => shift(1)} aria-label="Mois suivant">›</button>
        </div>
        <div className="cal-grid">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} className="cal-h">{d}</span>)}
          {cells.map((d, i) => {
            if (d == null) return <span key={i} />
            const k = key(view.y, view.m, d)
            const past = k < min
            const score = scores[k]
            return (
              <button key={i} className={`cal-d ${k === value ? 'on' : ''} ${k === min ? 'today' : ''}`} disabled={past} onClick={() => onPick(k)}>
                {d}
                {score != null ? <i className={tone(score)} /> : k <= lastForecast ? null : <i className="plan" />}
              </button>
            )
          })}
        </div>
        <p className="muted small">Pastille colorée : jour prévu (score). Pastille grise : planification (lune, soleil, saison) sans prévision météo.</p>
        <button className="wide" onClick={onClose}>Fermer</button>
      </div>
    </div>,
    document.body,
  )
}
