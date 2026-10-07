import { moonIllumination, moonLabel } from '../lib/moon'
import { coefficientAt, nearestStation, predictTides } from '../lib/tides'
import { noonOf, sunTimes } from '../lib/astro'
import { MONTHS, SPECIES } from '../lib/species'
import type { Mode, Spot } from '../lib/types'

const dayKeyParis = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

/** Jour trop lointain pour la météo : on montre ce qui reste calculable (lune, marées, coefficient, soleil, espèces de saison). */
export function PlanCard({ dayKey, spot, mode }: { dayKey: string; spot: Spot; mode: Mode }) {
  const noon = noonOf(dayKey)
  const sun = sunTimes(dayKey, spot.lat, spot.lon)
  const month = Number(dayKey.split('-')[1]) - 1
  const species = SPECIES.filter((s) => s.modes.includes(mode) && s.months[month] >= 2).sort((a, b) => b.months[month] - a.months[month])
  const label = new Date(noon * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const near = nearestStation(spot.lat, spot.lon)
  // Marées du jour (jour civil de Paris approché par midi UTC ± 12 h)
  const tides = near && near.distance < 120 ? predictTides(near.station, noon - 14 * 3600, noon + 14 * 3600).filter((t) => dayKeyParis(t.ts) === dayKey) : []
  const coefs = tides.filter((t) => t.type === 'haute').map((t) => coefficientAt(t.ts))
  const coef = coefs.length ? Math.round(coefs.reduce((a, b) => a + b, 0) / coefs.length) : coefficientAt(noon)

  return (
    <>
      <div className="card plan">
        <h3 className="cap">Planifier · {label}</h3>
        <p className="muted small">Trop loin pour une prévision météo fiable (16 jours maximum). Voici ce qui se calcule à l’avance. Reviens ce jour-là, moins de 16 jours avant, pour le score complet.</p>
        <div className="kv"><span className="muted">Lune</span><span>{moonLabel(noon)} · {moonIllumination(noon)} %</span></div>
        <div className="kv"><span className="muted">Coefficient</span><span>{coefs.length ? coefs.join(' · ') : coef} {coef >= 95 ? '(grandes marées)' : coef >= 70 ? '(fortes marées)' : coef >= 45 ? '(marées moyennes)' : '(mortes-eaux)'}</span></div>
        {tides.map((t) => <div className="kv" key={t.ts}><span className="muted">{t.type === 'haute' ? 'Pleine mer' : 'Basse mer'}</span><span>{hhmm(t.ts)} · {t.height.toFixed(1)} m</span></div>)}
        {sun && <div className="kv"><span className="muted">Soleil</span><span>↑ {hhmm(sun.sunrise)} · ↓ {hhmm(sun.sunset)}</span></div>}
        <p className="muted small">Marées et coefficient sont calculés à l’avance (marée astronomique, valable pour n’importe quelle date)  : jauge de {near?.station.name ?? '—'}{near ? ` (${Math.round(near.distance)} km)` : ''}, coefficient d’après Brest, à 2-3 points près de la valeur officielle. La météo, elle, n’est pas prévisible si loin.</p>
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
