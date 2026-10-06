import { moonIllumination, moonLabel, estimatedCoef } from '../lib/moon'
import { noonOf, sunTimes } from '../lib/astro'
import { MONTHS, SPECIES } from '../lib/species'
import type { Mode, Spot } from '../lib/types'

const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

/** Jour trop lointain pour la météo : on montre ce qui reste calculable (lune, coefficient estimé, soleil, espèces de saison). */
export function PlanCard({ dayKey, spot, mode }: { dayKey: string; spot: Spot; mode: Mode }) {
  const noon = noonOf(dayKey)
  const sun = sunTimes(dayKey, spot.lat, spot.lon)
  const month = Number(dayKey.split('-')[1]) - 1
  const species = SPECIES.filter((s) => s.modes.includes(mode) && s.months[month] >= 2).sort((a, b) => b.months[month] - a.months[month])
  const label = new Date(noon * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const coef = estimatedCoef(noon)

  return (
    <>
      <div className="card plan">
        <h3 className="cap">Planifier · {label}</h3>
        <p className="muted small">Trop loin pour une prévision météo fiable (16 jours maximum). Voici ce qui se calcule à l’avance. Reviens ce jour-là, moins de 16 jours avant, pour le score complet.</p>
        <div className="kv"><span className="muted">Lune</span><span>{moonLabel(noon)} · {moonIllumination(noon)} %</span></div>
        <div className="kv"><span className="muted">Coefficient estimé</span><span>≈ {coef} {coef >= 95 ? '(grandes marées)' : coef >= 70 ? '(fortes marées)' : coef >= 45 ? '(marées moyennes)' : '(mortes-eaux)'}</span></div>
        {sun && <div className="kv"><span className="muted">Soleil</span><span>↑ {hhmm(sun.sunrise)} · ↓ {hhmm(sun.sunset)}</span></div>}
        <p className="muted small">Le coefficient est une estimation (écart possible d’une dizaine de points), pas la valeur officielle du SHOM.</p>
      </div>
      <div className="card">
        <h3>Espèces de saison · {MONTHS[month]}</h3>
        {species.length ? species.map((s) => (
          <div className="win" key={s.name}>
            <span>{s.name}</span>
            <span>{'★'.repeat(s.months[month])}{'☆'.repeat(3 - s.months[month])}</span>
          </div>
        )) : <p className="muted small">Peu d’espèces ciblées à cette période.</p>}
      </div>
    </>
  )
}
