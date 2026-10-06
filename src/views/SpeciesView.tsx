import { useState } from 'react'
import { MONTHS, SPECIES } from '../lib/species'
import type { Mode } from '../lib/types'

export function SpeciesView({ mode }: { mode: Mode }) {
  const [month, setMonth] = useState(new Date().getMonth())
  const list = SPECIES.filter((s) => s.modes.includes(mode))
    .map((s) => ({ ...s, level: s.months[month] }))
    .sort((a, b) => b.level - a.level)

  return (
    <section>
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mois">
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <p className="muted small">Morbihan · {mode === 'bord' ? 'pêche du bord' : 'chasse sous-marine'}. Données de départ indicatives, à affiner avec tes propres prises. Vérifie toujours tailles minimales et réglementation en vigueur.</p>
      {list.map((s) => (
        <div className={`card ${s.level === 0 ? 'dim' : ''}`} key={s.name}>
          <div className="row between">
            <strong>{s.name}</strong>
            <span aria-label={`Intérêt ${s.level} sur 3`}>{s.level === 0 ? 'hors saison' : '★'.repeat(s.level) + '☆'.repeat(3 - s.level)}</span>
          </div>
          <div className="muted small">{s.tip}</div>
          {s.minSizeCm && <div className="small">Taille min. indicative : {s.minSizeCm} cm</div>}
        </div>
      ))}
    </section>
  )
}
