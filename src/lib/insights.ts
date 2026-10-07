import { moonPhase } from './moon'
import { coefficientAt, nearestStation, predictTides } from './tides'
import type { Spot, Trip } from './types'

export interface Insight {
  /** Phrase prête à afficher. */
  text: string
  /** Écart avec ta moyenne, en points de % de sorties avec prise. */
  lift: number
  n: number
  kind: 'good' | 'bad'
}

type Dim = { id: string; title: (b: string) => string; of: (t: Trip, spot?: Spot) => string | null }

const hourOf = (ms: number) => Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }))

/** Montant ou descendant, et proche de l'étale ou pas, au moment de la sortie (marée calculée à la jauge la plus proche). */
function tidePhase(t: Trip, spot?: Spot): string | null {
  if (!spot) return null
  const st = nearestStation(spot.lat, spot.lon)
  if (!st || st.distance > 120) return null
  const ts = Math.round(t.date / 1000)
  const ext = predictTides(st.station, ts - 8 * 3600, ts + 8 * 3600)
  const prev = [...ext].reverse().find((e) => e.ts <= ts)
  const next = ext.find((e) => e.ts > ts)
  if (!prev || !next) return null
  if (Math.min(ts - prev.ts, next.ts - ts) < 3600) return 'autour de l’étale'
  return prev.type === 'basse' ? 'à marée montante' : 'à marée descendante'
}

const DIMS: Dim[] = [
  {
    id: 'hour',
    title: (b) => `en ${b}`,
    of: (t) => {
      const h = hourOf(t.date)
      return h < 5 || h >= 22 ? 'pleine nuit' : h < 10 ? 'début de matinée' : h < 16 ? 'journée' : h < 20 ? 'fin d’après-midi' : 'soirée'
    },
  },
  { id: 'tide', title: (b) => b, of: (t, s) => tidePhase(t, s) },
  { id: 'coef', title: (b) => `avec un coefficient ${b}`, of: (t) => { const c = coefficientAt(Math.round(t.date / 1000)); return c < 55 ? 'faible (moins de 55)' : c < 85 ? 'moyen (55 à 85)' : 'fort (plus de 85)' } },
  { id: 'moon', title: (b) => b, of: (t) => { const p = moonPhase(Math.round(t.date / 1000)); const d = Math.min(p, 1 - p) * 2; const full = Math.abs(p - 0.5) * 2; return d < 0.2 ? 'autour de la nouvelle lune' : full < 0.2 ? 'autour de la pleine lune' : 'entre les phases de lune extrêmes' } },
  { id: 'wind', title: (b) => `avec ${b}`, of: (t) => (t.snapshot?.wind == null ? null : t.snapshot.wind < 12 ? 'peu de vent (moins de 12 km/h)' : t.snapshot.wind < 25 ? 'du vent modéré (12 à 25 km/h)' : 'du vent fort (plus de 25 km/h)') },
  { id: 'wave', title: (b) => `avec ${b}`, of: (t) => (t.snapshot?.wave == null ? null : t.snapshot.wave < 0.6 ? 'une mer calme (moins de 0,6 m)' : t.snapshot.wave < 1.3 ? 'un peu de houle (0,6 à 1,3 m)' : 'une grosse houle (plus de 1,3 m)') },
  { id: 'sea', title: (b) => `avec ${b}`, of: (t) => (t.snapshot?.seaTemp == null ? null : t.snapshot.seaTemp < 12 ? 'une eau froide (moins de 12 °C)' : t.snapshot.seaTemp < 16 ? 'une eau fraîche (12 à 16 °C)' : 'une eau douce (plus de 16 °C)') },
]

export const MIN_TRIPS = 8

/** Ce qui réussit chez toi : compare le taux de sorties avec prise selon les conditions. Rien en dessous de MIN_TRIPS sorties. */
export function computeInsights(trips: Trip[], spots: Spot[]): { insights: Insight[]; total: number; rate: number } {
  const list = trips.filter((t) => !t.deleted)
  const total = list.length
  const win = (ts: Trip[]) => ts.filter((t) => t.catches.length).length
  const rate = total ? Math.round((win(list) / total) * 100) : 0
  if (total < MIN_TRIPS) return { insights: [], total, rate }
  const byUid = new Map(spots.map((s) => [s.uid, s]))
  const base = win(list) / total
  const out: Insight[] = []
  for (const d of DIMS) {
    const groups = new Map<string, Trip[]>()
    for (const t of list) {
      const b = d.of(t, byUid.get(t.spotUid))
      if (b) groups.set(b, [...(groups.get(b) ?? []), t])
    }
    for (const [b, ts] of groups) {
      if (ts.length < 3) continue
      const r = win(ts) / ts.length
      const lift = Math.round((r - base) * 100)
      if (Math.abs(lift) < 20) continue
      out.push({
        kind: lift > 0 ? 'good' : 'bad',
        lift,
        n: ts.length,
        text: `${lift > 0 ? 'Tu prends plus souvent' : 'Tu rentres plus souvent bredouille'} ${d.title(b)} : ${Math.round(r * 100)} % de sorties avec prise (${win(ts)} sur ${ts.length}), contre ${rate} % en moyenne.`,
      })
    }
  }
  return { insights: out.sort((a, b) => Math.abs(b.lift) * Math.sqrt(b.n) - Math.abs(a.lift) * Math.sqrt(a.n)).slice(0, 5), total, rate }
}
