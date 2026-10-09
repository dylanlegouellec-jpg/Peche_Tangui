import { moonPhase } from './moon'
import type { HistoryAdjust } from './scoring'
import { coefficientAt, nearestStation, predictTides } from './tides'
import type { Mode, Spot, Tide, Trip } from './types'

export interface Insight {
  /** Phrase prête à afficher. */
  text: string
  /** Écart avec ta moyenne, en points de % de sorties avec prise. */
  lift: number
  n: number
  kind: 'good' | 'bad'
}

/** Conditions d'un instant : celles d'une sortie passée ou d'une heure de prévision. */
interface Cond {
  ts: number // secondes
  wind?: number | null
  wave?: number | null
  seaTemp?: number | null
  /** Phase de marée déjà connue (sinon calculée à la jauge du spot). */
  tide?: string | null
}

type Dim = { id: string; title: (b: string) => string; of: (c: Cond) => string | null }

const hourOf = (ts: number) => Number(new Date(ts * 1000).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }))

/** Montant ou descendant, ou autour de l'étale, d'après une liste de pleines et basses mers. */
export function tidePhaseFrom(ts: number, ext: Tide[]): string | null {
  const prev = [...ext].reverse().find((e) => e.ts <= ts)
  const next = ext.find((e) => e.ts > ts)
  if (!prev || !next) return null
  if (Math.min(ts - prev.ts, next.ts - ts) < 3600) return 'autour de l’étale'
  return prev.type === 'basse' ? 'à marée montante' : 'à marée descendante'
}

/** Phase de marée au moment d'une sortie passée (marée calculée à la jauge la plus proche du spot). */
function tidePhase(t: Trip, spot?: Spot): string | null {
  if (!spot) return null
  const st = nearestStation(spot.lat, spot.lon)
  if (!st || st.distance > 120) return null
  const ts = Math.round(t.date / 1000)
  return tidePhaseFrom(ts, predictTides(st.station, ts - 8 * 3600, ts + 8 * 3600))
}

const DIMS: Dim[] = [
  {
    id: 'hour',
    title: (b) => `en ${b}`,
    of: (c) => {
      const h = hourOf(c.ts)
      return h < 5 || h >= 22 ? 'pleine nuit' : h < 10 ? 'début de matinée' : h < 16 ? 'journée' : h < 20 ? 'fin d’après-midi' : 'soirée'
    },
  },
  { id: 'tide', title: (b) => b, of: (c) => c.tide ?? null },
  { id: 'coef', title: (b) => `avec un coefficient ${b}`, of: (c) => { const k = coefficientAt(c.ts); return k < 55 ? 'faible (moins de 55)' : k < 85 ? 'moyen (55 à 85)' : 'fort (plus de 85)' } },
  { id: 'moon', title: (b) => b, of: (c) => { const p = moonPhase(c.ts); const d = Math.min(p, 1 - p) * 2; const full = Math.abs(p - 0.5) * 2; return d < 0.2 ? 'autour de la nouvelle lune' : full < 0.2 ? 'autour de la pleine lune' : 'entre les phases de lune extrêmes' } },
  { id: 'wind', title: (b) => `avec ${b}`, of: (c) => (c.wind == null ? null : c.wind < 12 ? 'peu de vent (moins de 12 km/h)' : c.wind < 25 ? 'du vent modéré (12 à 25 km/h)' : 'du vent fort (plus de 25 km/h)') },
  { id: 'wave', title: (b) => `avec ${b}`, of: (c) => (c.wave == null ? null : c.wave < 0.6 ? 'une mer calme (moins de 0,6 m)' : c.wave < 1.3 ? 'un peu de houle (0,6 à 1,3 m)' : 'une grosse houle (plus de 1,3 m)') },
  { id: 'sea', title: (b) => `avec ${b}`, of: (c) => (c.seaTemp == null ? null : c.seaTemp < 12 ? 'une eau froide (moins de 12 °C)' : c.seaTemp < 16 ? 'une eau fraîche (12 à 16 °C)' : 'une eau douce (plus de 16 °C)') },
]

export const MIN_TRIPS = 8

const condOf = (t: Trip, spot?: Spot): Cond => ({ ts: Math.round(t.date / 1000), wind: t.snapshot?.wind, wave: t.snapshot?.wave, seaTemp: t.snapshot?.seaTemp, tide: tidePhase(t, spot) })

/** Regroupe les sorties par tranche de conditions, pour chaque critère : [critère, tranche] → sorties. */
function bucket(list: Trip[], byUid: Map<string, Spot>) {
  const out = new Map<string, { dim: Dim; label: string; trips: Trip[] }>()
  for (const t of list) {
    const c = condOf(t, byUid.get(t.spotUid))
    for (const d of DIMS) {
      const b = d.of(c)
      if (!b) continue
      const k = `${d.id}|${b}`
      const e = out.get(k) ?? { dim: d, label: b, trips: [] }
      e.trips.push(t)
      out.set(k, e)
    }
  }
  return out
}

const wins = (ts: Trip[]) => ts.filter((t) => t.catches.length).length

/** Ce qui réussit chez toi : compare le taux de sorties avec prise selon les conditions. Rien en dessous de MIN_TRIPS sorties. */
export function computeInsights(trips: Trip[], spots: Spot[]): { insights: Insight[]; total: number; rate: number } {
  const list = trips.filter((t) => !t.deleted)
  const total = list.length
  const rate = total ? Math.round((wins(list) / total) * 100) : 0
  if (total < MIN_TRIPS) return { insights: [], total, rate }
  const base = wins(list) / total
  const out: Insight[] = []
  for (const { dim, label, trips: ts } of bucket(list, new Map(spots.map((s) => [s.uid, s]))).values()) {
    if (ts.length < 3) continue
    const r = wins(ts) / ts.length
    const lift = Math.round((r - base) * 100)
    if (Math.abs(lift) < 20) continue
    out.push({
      kind: lift > 0 ? 'good' : 'bad',
      lift,
      n: ts.length,
      text: `${lift > 0 ? 'Tu prends plus souvent' : 'Tu rentres plus souvent bredouille'} ${dim.title(label)} : ${Math.round(r * 100)} % de sorties avec prise (${wins(ts)} sur ${ts.length}), contre ${rate} % en moyenne.`,
    })
  }
  return { insights: out.sort((a, b) => Math.abs(b.lift) * Math.sqrt(b.n) - Math.abs(a.lift) * Math.sqrt(a.n)).slice(0, 5), total, rate }
}

/** Nombre minimum de sorties (du même type) avant que l'historique n'influence le score. */
export const MIN_HISTORY = 12
/** Écart maximal ajouté ou retiré au score, en points. */
const MAX_PTS = 10

/**
 * Apprend de tes sorties : pour une heure de prévision, regarde dans quelles tranches de conditions (heure, marée, coefficient, lune, vent, houle, eau)
 * elle tombe, compare le taux de sorties avec prise de chaque tranche à ta moyenne, et en déduit un bonus ou un malus de ±10 points au plus.
 * Les tranches avec peu de sorties pèsent peu. Renvoie `null` tant qu'il y a moins de MIN_HISTORY sorties du même type.
 */
export function buildHistory(trips: Trip[], spots: Spot[], mode: Mode): HistoryAdjust | null {
  const list = trips.filter((t) => !t.deleted && t.mode === mode)
  if (list.length < MIN_HISTORY) return null
  const base = wins(list) / list.length
  const stats = new Map<string, { n: number; lift: number; label: string; dim: Dim }>()
  for (const [k, e] of bucket(list, new Map(spots.map((s) => [s.uid, s]))))
    stats.set(k, { n: e.trips.length, lift: wins(e.trips) / e.trips.length - base, label: e.label, dim: e.dim })
  return (h, tides) => {
    const c: Cond = { ts: h.ts, wind: h.wind, wave: h.wave, seaTemp: h.seaTemp, tide: tidePhaseFrom(h.ts, tides) }
    let sum = 0
    let used = 0
    const notes: { w: number; text: string }[] = []
    for (const d of DIMS) {
      const b = d.of(c)
      const st = b ? stats.get(`${d.id}|${b}`) : undefined
      if (!st || st.n < 3) continue
      const shrunk = (st.lift * st.n) / (st.n + 4) // peu de sorties : l'écart compte moins
      sum += shrunk
      used++
      if (Math.abs(shrunk) >= 0.08) notes.push({ w: Math.abs(shrunk), text: `${shrunk > 0 ? 'réussit' : 'déçoit'} ${d.title(st.label)}` })
    }
    if (!used) return null
    const pts = Math.round(Math.max(-MAX_PTS, Math.min(MAX_PTS, (sum / used) * 40)))
    if (!pts) return null
    return { pts, note: notes.sort((a, b) => b.w - a.w).slice(0, 2).map((n) => n.text).join(', ') || 'conditions proches de tes sorties passées' }
  }
}
