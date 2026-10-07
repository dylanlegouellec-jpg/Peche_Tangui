import { useEffect, useState } from 'react'
import { rankSpots, type SpotDay } from '../lib/plan'
import type { Mode, Spot, WindUnit } from '../lib/types'

const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const tone = (s: number) => (s >= 70 ? 'good' : s >= 45 ? 'mid' : 'bad')

/** Tous les spots classés pour le jour choisi : où aller ? */
export function BestSpots({ spots, mode, unit, dayKey, label, current, onPick }: { spots: Spot[]; mode: Mode; unit: WindUnit; dayKey: string; label: string; current?: number; onPick: (id: number) => void }) {
  const [rows, setRows] = useState<SpotDay[] | null>(null)
  const ids = spots.map((s) => `${s.id}:${s.lat}:${s.lon}:${s.facing ?? ''}`).join('|')

  useEffect(() => {
    let cancelled = false
    setRows(null)
    rankSpots(spots, mode, unit, dayKey).then((r) => !cancelled && setRows(r))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, mode, unit, dayKey])

  if (spots.length < 2) return null
  return (
    <div className="card">
      <h3>Où aller {label} ?</h3>
      {rows === null && <p className="muted small">Calcul des spots…</p>}
      {rows?.length === 0 && <p className="muted small">Pas de prévision pour ce jour.</p>}
      {rows?.map((r, i) => (
        <button key={r.spot.uid} className={`rank ${r.spot.id === current ? 'on' : ''}`} onClick={() => onPick(r.spot.id!)}>
          <span className="rk">{i + 1}</span>
          <span className="rn">
            {r.spot.name}
            <span className="muted small"> {hhmm(r.start)}–{hhmm(r.end)}{r.partial ? ' · partiel' : ''}</span>
          </span>
          <span className={`chip ${tone(r.score)}`}>{r.score}</span>
        </button>
      ))}
    </div>
  )
}
