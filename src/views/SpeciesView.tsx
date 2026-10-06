import { useState } from 'react'
import { MONTHS, SPECIES, type Species } from '../lib/species'
import type { Mode } from '../lib/types'

function Item({ s, level }: { s: Species; level: number }) {
  return (
    <div className={`card ${level === 0 ? 'dim' : ''}`}>
      <div className="row between">
        <strong>{s.name}</strong>
        <span aria-label={`Intérêt ${level} sur 3`}>{level === 0 ? 'hors saison' : '★'.repeat(level) + '☆'.repeat(3 - level)}</span>
      </div>
      <div className="muted small">{s.tip}</div>
      {s.minSizeCm && <div className="small">Taille min. indicative : {s.minSizeCm} cm</div>}
    </div>
  )
}

export function SpeciesView({ mode }: { mode: Mode }) {
  const [month, setMonth] = useState(new Date().getMonth())
  const list = SPECIES.filter((s) => s.modes.includes(mode))
    .map((s) => ({ s, level: s.months[month] }))
    .sort((a, b) => b.level - a.level)
  const main = list.filter((x) => x.s.priority)
  const other = list.filter((x) => !x.s.priority)

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
      <h3 className="sec">Espèces ciblées</h3>
      <div className="cols-2">{main.map((x) => <Item key={x.s.name} {...x} />)}</div>
      <h3 className="sec">Autres espèces</h3>
      <div className="cols-2">{other.map((x) => <Item key={x.s.name} {...x} />)}</div>
    </section>
  )
}
