import type { Forecast } from './types'

// Copernicus Marine, modèle IBI (golfe de Gascogne, maille ~3 km) : courants, houle et transparence de l'eau, plus fins que Open-Meteo près de la côte.
export interface CmemsPhysics {
  cell: { lat: number; lon: number; km: number }
  rows: { ts: number; speed: number | null; dir: number | null; temp: number | null }[]
}
export interface CmemsWaves {
  cell: { lat: number; lon: number; km: number }
  rows: { ts: number; h: number | null; dir: number | null; per: number | null }[]
}
export interface Cmems {
  phy: CmemsPhysics | null
  wav: CmemsWaves | null
  bgc: { ts: number; zeu: number; secchi: number; km: number } | null
}

const cache = new Map<string, { at: number; data: Cmems | null }>()

/** Données Copernicus autour d'un point (gardées 30 min). `null` si le service ne répond pas : l'appli garde alors Open-Meteo. */
export async function fetchCmems(lat: number, lon: number): Promise<Cmems | null> {
  const k = `${lat.toFixed(3)},${lon.toFixed(3)}`
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data
  try {
    const r = await fetch(`/api/cmems?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(35000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = (await r.json()) as Cmems
    console.info(`Copernicus IBI : courant ${data.phy ? `cellule à ${data.phy.cell.km} km` : 'indisponible'}, vagues ${data.wav ? `cellule à ${data.wav.cell.km} km` : 'indisponibles'}, transparence ${data.bgc ? 'ok' : 'indisponible'}`)
    cache.set(k, { at: Date.now(), data })
    return data
  } catch (e) {
    console.warn('Copernicus indisponible :', e)
    return hit?.data ?? null
  }
}

/** Remplace, heure par heure, le courant et la houle d'Open-Meteo par ceux de Copernicus quand ils existent (le reste est conservé). */
export function mergeCmems(forecast: Forecast, cm: Cmems | null): Forecast {
  if (!cm || (!cm.phy && !cm.wav)) return forecast
  const cur = new Map(cm.phy?.rows.map((r) => [r.ts, r]))
  const wav = new Map(cm.wav?.rows.map((r) => [r.ts, r]))
  const hours = forecast.hours.map((h) => {
    const c = cur.get(h.ts)
    const w = wav.get(h.ts)
    return {
      ...h,
      ...(c && c.speed != null ? { current: c.speed, currentDir: c.dir, curSrc: 'cmems' as const } : {}),
      ...(w && w.h != null ? { wave: w.h, waveDir: w.dir ?? h.waveDir, wavePeriod: w.per ?? h.wavePeriod, waveSrc: 'cmems' as const } : {}),
    }
  })
  return { ...forecast, hours }
}
