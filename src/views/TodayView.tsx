import { useEffect, useMemo, useState } from 'react'
import { findTides, loadForecast } from '../lib/forecast'
import { estimatedCoef, moonLabel } from '../lib/moon'
import { bestWindows, scoreSeries } from '../lib/scoring'
import type { Forecast, Mode, Spot } from '../lib/types'

const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const dayShort = (ts: number) => new Date(ts * 1000).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })
const tone = (s: number) => (s >= 70 ? 'good' : s >= 45 ? 'mid' : 'bad')

interface Props {
  spots: Spot[]
  spotId: number | undefined
  setSpotId: (id: number) => void
  mode: Mode
  setMode: (m: Mode) => void
}

export function TodayView({ spots, spotId, setSpotId, mode, setMode }: Props) {
  const spot = spots.find((s) => s.id === spotId) ?? spots[0]
  const [data, setData] = useState<{ forecast: Forecast; offline: boolean } | null | undefined>(undefined)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    if (!spot) return
    let cancelled = false
    setData(undefined)
    loadForecast(spot).then((d) => !cancelled && setData(d))
    return () => {
      cancelled = true
    }
  }, [spot])

  const now = Math.floor(Date.now() / 1000)
  const tides = useMemo(() => (data ? findTides(data.forecast.hours) : []), [data])
  const series = useMemo(() => (data ? scoreSeries(data.forecast, tides, mode, now) : []), [data, tides, mode, now])
  const windows = useMemo(() => bestWindows(series), [series])
  const current = series[0]
  const focus = series.find((s) => s.ts === selected) ?? current
  const upcomingTides = tides.filter((t) => t.ts >= now).slice(0, 4)

  return (
    <section>
      <div className="row">
        <select value={spot?.id} onChange={(e) => setSpotId(Number(e.target.value))} aria-label="Spot">
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Type de sortie">
          <button className={mode === 'bord' ? 'on' : ''} onClick={() => setMode('bord')}>
            Bord de mer
          </button>
          <button className={mode === 'plongee' ? 'on' : ''} onClick={() => setMode('plongee')}>
            Sous-marine
          </button>
        </div>
      </div>

      {data === undefined && <p className="muted">Chargement des prévisions…</p>}
      {data === null && <p className="card warn">Impossible de charger les prévisions et aucune donnée en cache. Reconnecte-toi une fois pour les télécharger.</p>}

      {data && current && (
        <>
          {data.offline && <p className="card warn">Mode hors ligne : prévisions du {new Date(data.forecast.fetchedAt).toLocaleString('fr-FR')}.</p>}

          <div className={`card score ${tone(focus.score)}`}>
            <div className="big">{focus.score}</div>
            <div>
              <strong>{focus.ts === current.ts ? 'Maintenant' : `${dayShort(focus.ts)} ${hhmm(focus.ts)}`}</strong>
              <div className="muted">{focus.score >= 70 ? 'Conditions très favorables' : focus.score >= 45 ? 'Conditions correctes' : 'Conditions peu favorables'}</div>
            </div>
          </div>

          {focus.warnings.map((w) => (
            <p key={w} className="card warn">
              ⚠ {w}
            </p>
          ))}
          {mode === 'plongee' && <p className="muted small">Ne plonge jamais seul, balise de surface obligatoire. La visibilité est une estimation, pas une mesure.</p>}

          <div className="card">
            <h3>Détail</h3>
            {focus.factors.map((f) => (
              <div className="factor" key={f.label}>
                <span>{f.label}</span>
                <div className="bar">
                  <i className={tone(f.value * 100)} style={{ width: `${f.value * 100}%` }} />
                </div>
                <span className="muted small">{f.note}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Meilleurs créneaux</h3>
            {windows.map((w) => (
              <div className="win" key={w.day}>
                <span className="cap">{w.day}</span>
                <span>
                  {hhmm(w.start)} – {hhmm(w.end)}
                </span>
                <b className={tone(w.avg)}>{w.avg}</b>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Prochaines 48 h</h3>
            <div className="spark">
              {series.slice(0, 48).map((s) => (
                <button key={s.ts} className={`${tone(s.score)} ${s.ts === focus.ts ? 'sel' : ''}`} style={{ height: `${Math.max(8, s.score)}%` }} onClick={() => setSelected(s.ts)} title={`${dayShort(s.ts)} ${hhmm(s.ts)} : ${s.score}`} aria-label={`${hhmm(s.ts)} ${s.score}`} />
              ))}
            </div>
            <div className="muted small">Touche une barre pour voir le détail de l’heure.</div>
          </div>

          <div className="card">
            <h3>Marées & lune</h3>
            {upcomingTides.length ? (
              upcomingTides.map((t) => (
                <div className="win" key={t.ts}>
                  <span className="cap">{t.type === 'haute' ? 'Pleine mer' : 'Basse mer'}</span>
                  <span>
                    {dayShort(t.ts)} {hhmm(t.ts)}
                  </span>
                  <span className="muted">{t.height.toFixed(1)} m</span>
                </div>
              ))
            ) : (
              <p className="muted small">Pas de données de marée pour ce point.</p>
            )}
            <p className="muted small">
              {moonLabel(now)} · coefficient estimé ≈ {estimatedCoef(now)} (approximation, pas la valeur officielle du SHOM).
            </p>
          </div>
        </>
      )}
    </section>
  )
}
