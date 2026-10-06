import type { Mode, Trip } from './types'

export interface Filters {
  year: number | 'all'
  mode: Mode | 'all'
}

export interface SpeciesStat {
  name: string
  count: number
  maxSize?: number
  weight: number
}

export interface Stats {
  trips: number
  blank: number
  catches: number
  weight: number
  species: SpeciesStat[]
  spots: { name: string; trips: number; catches: number }[]
  months: number[]
  biggest?: { species: string; size: number; spot: string; date: number }
  avg: { airTemp?: number; seaTemp?: number; wind?: number; wave?: number; pressure?: number; score?: number }
  tripsList: Trip[]
}

const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
}

export const yearsOf = (trips: Trip[]) => [...new Set(trips.map((t) => new Date(t.date).getFullYear()))].sort((a, b) => b - a)

/** Statistiques de pêche sur les sorties filtrées (année, type de sortie). */
export function computeStats(all: Trip[], f: Filters): Stats {
  const trips = all
    .filter((t) => !t.deleted && (f.year === 'all' || new Date(t.date).getFullYear() === f.year) && (f.mode === 'all' || t.mode === f.mode))
    .sort((a, b) => a.date - b.date)

  const species = new Map<string, SpeciesStat>()
  const spots = new Map<string, { name: string; trips: number; catches: number }>()
  const months = Array(12).fill(0) as number[]
  let biggest: Stats['biggest']
  let weight = 0
  let catches = 0
  let blank = 0

  for (const t of trips) {
    const n = t.catches.length
    if (!n) blank++
    catches += n
    months[new Date(t.date).getMonth()] += n
    const sp = spots.get(t.spotUid) ?? { name: t.spotName, trips: 0, catches: 0 }
    sp.trips++
    sp.catches += n
    spots.set(t.spotUid, sp)
    for (const c of t.catches) {
      const key = c.species.trim() || 'Inconnue'
      const s = species.get(key) ?? { name: key, count: 0, weight: 0 }
      s.count++
      s.weight += c.weightKg ?? 0
      weight += c.weightKg ?? 0
      if (c.sizeCm && c.sizeCm > (s.maxSize ?? 0)) s.maxSize = c.sizeCm
      species.set(key, s)
      if (c.sizeCm && c.sizeCm > (biggest?.size ?? 0)) biggest = { species: key, size: c.sizeCm, spot: t.spotName, date: t.date }
    }
  }

  const good = trips.filter((t) => t.catches.length && t.snapshot)
  return {
    trips: trips.length,
    blank,
    catches,
    weight,
    species: [...species.values()].sort((a, b) => b.count - a.count),
    spots: [...spots.values()].sort((a, b) => b.catches - a.catches || b.trips - a.trips),
    months,
    biggest,
    avg: {
      airTemp: mean(good.map((t) => t.snapshot!.airTemp)),
      seaTemp: mean(good.map((t) => t.snapshot!.seaTemp)),
      wind: mean(good.map((t) => t.snapshot!.wind)),
      wave: mean(good.map((t) => t.snapshot!.wave)),
      pressure: mean(good.map((t) => t.snapshot!.pressure)),
      score: mean(good.map((t) => t.snapshot!.score)),
    },
    tripsList: trips,
  }
}
