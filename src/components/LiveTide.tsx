import { useEffect, useMemo, useState } from 'react'
import { fetchObservations, type Observation } from '../lib/refmar'
import { nearestLiveStation, predictCurve, predictTides } from '../lib/tides'

const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

/** Niveau d'eau réellement mesuré (marégraphe SHOM) comparé à la prédiction, sur 24 h. */
export function LiveTide({ lat, lon }: { lat: number; lon: number }) {
  const live = useMemo(() => nearestLiveStation(lat, lon), [lat, lon])
  const [obs, setObs] = useState<Observation[] | null | undefined>(undefined)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (!live?.station.refmar) return
    let cancelled = false
    const load = () =>
      fetchObservations(live.station.refmar!)
        .then((o) => !cancelled && (setObs(o), setNow(Math.floor(Date.now() / 1000))))
        .catch((e) => {
          console.warn('Mesures REFMAR indisponibles :', e)
          if (!cancelled) setObs(null)
        })
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [live])

  const model = useMemo(() => {
    if (!live) return null
    const from = now - 12 * 3600
    const to = now + 12 * 3600
    return { curve: predictCurve(live.station, from, to), ext: predictTides(live.station, from, to), from, to }
  }, [live, now])

  if (!live || !model || !obs || obs.length < 3) {
    return obs === undefined && live ? <div className="card"><h3>Niveau d’eau réel</h3><p className="muted small">Chargement des mesures du SHOM…</p></div> : null
  }

  const last = obs[obs.length - 1]
  const before = obs.find((o) => o.ts >= last.ts - 1800) ?? obs[0]
  const slope = last.level - before.level // m sur ~30 min
  const predAt = model.curve.reduce((a, b) => (Math.abs(b.ts - last.ts) < Math.abs(a.ts - last.ts) ? b : a))
  const gap = last.level - predAt.level
  const ageMin = Math.max(0, Math.round((now - last.ts) / 60))

  // Graphique SVG
  const W = 320
  const H = 120
  const levels = [...model.curve.map((p) => p.level), ...obs.map((o) => o.level)]
  const lo = Math.min(...levels) - 0.2
  const hi = Math.max(...levels) + 0.2
  const PAD = 14
  const x = (ts: number) => PAD + ((ts - model.from) / (model.to - model.from)) * (W - 2 * PAD)
  const y = (l: number) => H - 14 - ((l - lo) / (hi - lo)) * (H - 28)
  const line = (pts: { ts: number; level: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ')

  return (
    <div className="card live">
      <div className="row between">
        <h3>Niveau d’eau réel</h3>
        <span className="muted small">{live.station.name} · SHOM</span>
      </div>
      <div className="live-main">
        <div>
          <strong className="big2">{last.level.toFixed(2)} m</strong>
          <span className="muted small"> mesuré il y a {ageMin} min</span>
        </div>
        <div className="live-trend">{Math.abs(slope) < 0.02 ? '→ étale' : slope > 0 ? '↗ monte' : '↘ descend'}</div>
      </div>
      <div className="kv">
        <span className="muted">Écart avec la prédiction</span>
        <span className={Math.abs(gap) >= 0.3 ? 'warn' : ''}>
          {gap >= 0 ? '+' : ''}
          {gap.toFixed(2)} m {Math.abs(gap) < 0.05 ? '(conforme)' : gap > 0 ? '(surcote : la mer est plus haute que prévu)' : '(décote : la mer est plus basse que prévu)'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 10}`} className="tide-chart" role="img" aria-label="Niveau d’eau mesuré et prédit sur 24 heures">
        <line x1={x(now)} x2={x(now)} y1="4" y2={H - 14} className="now-line" />
        <path d={line(model.curve)} className="pred" />
        <path d={line(obs)} className="obs" />
        {model.ext.map((e) => (
          <g key={e.ts}>
            <circle cx={x(e.ts)} cy={y(e.height)} r="2.6" className={e.type === 'haute' ? 'pm' : 'bm'} />
            <text x={x(e.ts)} y={e.type === 'haute' ? y(e.height) - 5 : y(e.height) + 12} textAnchor="middle" className="ext">{hhmm(e.ts)}</text>
          </g>
        ))}
        <text x={PAD} y={H + 8} className="ext">−12 h</text>
        <text x={W / 2} y={H + 8} textAnchor="middle" className="ext">maintenant</text>
        <text x={W - PAD} y={H + 8} textAnchor="end" className="ext">+12 h</text>
      </svg>
      <p className="muted small"><span className="lg obs-lg" /> mesuré <span className="lg pred-lg" /> prédit. Mesures réelles du marégraphe de {live.station.name} (réseau REFMAR du SHOM), à {Math.round(live.distance)} km de ton spot : sur place, le niveau peut différer un peu.</p>
    </div>
  )
}
