import { createTidePredictor } from '@neaps/tide-predictor'
import data from '../data/tide-stations.json'
import type { Tide } from './types'

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  msl: number
  c: [string, number, number][]
}

export const TIDE_SOURCE = data.source
const stations = data.stations as Station[]
const BREST = stations.find((s) => s.name === 'Brest')!

type Predictor = ReturnType<typeof createTidePredictor>
const predictors = new Map<string, Predictor>()
const predictor = (s: Station): Predictor => {
  let p = predictors.get(s.id)
  if (!p) {
    p = createTidePredictor(
      s.c.map(([name, amplitude, phase]) => ({ name, amplitude, phase })),
      { offset: s.msl },
    )
    predictors.set(s.id, p)
  }
  return p
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Station de marée la plus proche d'un point (jauges REFMAR). `distance` en km. */
export function nearestStation(lat: number, lon: number): { station: Station; distance: number } | null {
  let best: { station: Station; distance: number } | null = null
  for (const s of stations) {
    // Les stations d'estuaire (Rouen, Nantes…) suivent d'autres règles : on ne les propose que si elles sont vraiment proches.
    const d = km(lat, lon, s.lat, s.lon)
    if (!best || d < best.distance) best = { station: s, distance: d }
  }
  return best
}

/** Pleines et basses mers prédites (astronomiques) d'une station entre deux instants unix (s). Hauteurs en m au-dessus du zéro de la station. */
export function predictTides(station: Station, fromTs: number, toTs: number): Tide[] {
  return predictor(station)
    .getExtremesPrediction({ start: new Date(fromTs * 1000), end: new Date(toTs * 1000) })
    .map((e) => ({ ts: Math.round(e.time.getTime() / 1000), type: e.high ? ('haute' as const) : ('basse' as const), height: e.level }))
}

// ---- Coefficient de marée -------------------------------------------------
// Définition officielle : demi-marnage à Brest rapporté à l'unité de hauteur U = 3,05 m, ×100 → coefficient = marnage / 6,10 m × 100.
const U2 = 6.1
const BLOCK = 30 * 86400
const brestHighs = new Map<number, { ts: number; coef: number }[]>()

function highsOfBlock(block: number) {
  let list = brestHighs.get(block)
  if (!list) {
    const start = block * BLOCK
    const ext = predictTides(BREST, start - 86400, start + BLOCK + 86400)
    list = []
    for (let i = 1; i < ext.length - 1; i++) {
      if (ext[i].type !== 'haute' || ext[i].ts < start || ext[i].ts >= start + BLOCK) continue
      const range = ext[i].height - (ext[i - 1].height + ext[i + 1].height) / 2
      list.push({ ts: ext[i].ts, coef: Math.round((range / U2) * 100) })
    }
    brestHighs.set(block, list)
  }
  return list
}

/** Coefficient de la marée la plus proche d'un instant (calculé d'après les marées de Brest, valable pour n'importe quelle date). */
export function coefficientAt(ts: number): number {
  const b = Math.floor(ts / BLOCK)
  let best = { ts: Infinity, coef: 70 }
  for (const h of [...highsOfBlock(b - 1), ...highsOfBlock(b), ...highsOfBlock(b + 1)]) if (Math.abs(h.ts - ts) < Math.abs(best.ts - ts)) best = h
  return best.coef
}

/** Coefficients des marées d'une journée [début, fin[ (instants unix, s) : en général un le matin, un l'après-midi. */
export function coefficientsBetween(fromTs: number, toTs: number): number[] {
  const out: number[] = []
  for (let b = Math.floor(fromTs / BLOCK); b <= Math.floor(toTs / BLOCK); b++) for (const h of highsOfBlock(b)) if (h.ts >= fromTs && h.ts < toTs) out.push(h.coef)
  return out
}
