import { findTides, loadForecast } from './forecast'
import { bestWindows, scoreSeries, type Window } from './scoring'
import { nearestStation, predictTides } from './tides'
import type { Mode, Spot, WindUnit } from './types'

export interface SpotDay {
  spot: Spot
  /** Score moyen du meilleur créneau du jour (0–100). */
  score: number
  start: number
  end: number
  /** Jour sans houle ni marée dans la prévision : score partiel. */
  partial: boolean
}

/** Score de chaque jour d'un spot, d'après les prévisions déjà en cache (ou téléchargées). */
export async function spotDays(spot: Spot, mode: Mode, unit: WindUnit): Promise<Map<string, Window & { partial: boolean }> | null> {
  const res = await loadForecast(spot)
  if (!res) return null
  const f = res.forecast
  const st = nearestStation(spot.lat, spot.lon)
  const tides = st && st.distance < 120 ? predictTides(st.station, f.hours[0].ts - 43200, f.hours[f.hours.length - 1].ts + 43200) : findTides(f.hours)
  const series = scoreSeries(f, tides, mode, 0, unit, { facing: spot.facing })
  const withSea = new Set(f.hours.filter((h) => h.wave != null).map((h) => new Date(h.ts * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })))
  return new Map(bestWindows(series).map((w) => [w.key, { ...w, partial: !withSea.has(w.key) }]))
}

/** Tous les spots classés pour un jour : le meilleur en premier. */
export async function rankSpots(spots: Spot[], mode: Mode, unit: WindUnit, key: string): Promise<SpotDay[]> {
  const all = await Promise.all(spots.map(async (spot) => ({ spot, days: await spotDays(spot, mode, unit) })))
  const out: SpotDay[] = []
  for (const { spot, days } of all) {
    const w = days?.get(key)
    if (w) out.push({ spot, score: w.avg, start: w.start, end: w.end, partial: w.partial })
  }
  return out.sort((a, b) => b.score - a.score)
}
