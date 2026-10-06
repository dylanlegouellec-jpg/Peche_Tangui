import { db } from './db'
import type { Forecast, HourPoint, Spot, Tide } from './types'

const TZ = 'Europe/Paris'

async function getJson(url: string, timeoutMs = 12000, retries = 1): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } catch (e) {
    // Une connexion qui bloque arrive parfois sur mobile : un seul nouvel essai suffit le plus souvent.
    if (retries > 0) return getJson(url, timeoutMs, retries - 1)
    throw e
  }
}

export type Loaded = { forecast: Forecast; offline: boolean }

/** Les prévisions sont réutilisées tant qu'elles ont moins de 15 min (Open-Meteo les met à jour toutes les 1 à 3 h). */
export const FRESH_MS = 15 * 60 * 1000

const memory = new Map<number, Loaded>()
/** Dernières prévisions déjà chargées pour ce spot, pour afficher sans attendre pendant la mise à jour. */
export const peekForecast = (spotId: number | undefined) => (spotId == null ? undefined : memory.get(spotId))

/** Prévisions Open-Meteo (météo + marine), sans clé API. Retombe sur le cache hors-ligne. */
export async function loadForecast(spot: Spot, force = false): Promise<Loaded | null> {
  const id = spot.id!
  const remember = (l: Loaded) => (memory.set(id, l), l)
  if (!force) {
    const cached = memory.get(id)?.forecast ?? (await db.forecasts.get(id))
    if (cached && cached.lat === spot.lat && cached.lon === spot.lon && Date.now() - cached.fetchedAt < (cached.noSea ? 60_000 : FRESH_MS)) return remember({ forecast: cached, offline: false })
  }
  try {
    // Météo : jusqu'à 16 jours. Mer (houle, marées) : 8 jours maximum chez Open-Meteo.
    const common = `latitude=${spot.lat}&longitude=${spot.lon}&timezone=${TZ}&timeformat=unixtime&past_days=2`
    const [meteo, marine] = await Promise.all([
      getJson(
        `https://api.open-meteo.com/v1/forecast?${common}&forecast_days=16&wind_speed_unit=kmh&hourly=wind_speed_10m,wind_gusts_10m,pressure_msl,precipitation,is_day,temperature_2m,apparent_temperature,cloud_cover&daily=sunrise,sunset`,
      ),
      getJson(
        `https://marine-api.open-meteo.com/v1/marine?${common}&forecast_days=8&hourly=wave_height,wave_period,sea_surface_temperature,sea_level_height_msl`,
        8000,
      ).catch(() => null),
    ])
    const mh = marine?.hourly
    const hours: HourPoint[] = meteo.hourly.time.map((ts: number, i: number) => ({
      ts,
      wind: meteo.hourly.wind_speed_10m[i],
      gust: meteo.hourly.wind_gusts_10m[i],
      pressure: meteo.hourly.pressure_msl[i],
      precip: meteo.hourly.precipitation[i],
      isDay: meteo.hourly.is_day[i] === 1,
      temp: meteo.hourly.temperature_2m?.[i] ?? null,
      feels: meteo.hourly.apparent_temperature?.[i] ?? null,
      cloud: meteo.hourly.cloud_cover?.[i] ?? null,
      wave: mh?.wave_height?.[i] ?? null,
      wavePeriod: mh?.wave_period?.[i] ?? null,
      seaTemp: mh?.sea_surface_temperature?.[i] ?? null,
      seaLevel: mh?.sea_level_height_msl?.[i] ?? null,
    }))
    const sun = meteo.daily.sunrise.map((s: number, i: number) => ({ sunrise: s, sunset: meteo.daily.sunset[i] }))
    const forecast: Forecast = { spotId: id, lat: spot.lat, lon: spot.lon, fetchedAt: Date.now(), hours, sun, noSea: !marine }
    await db.forecasts.put(forecast)
    console.info(`Prévisions chargées pour « ${spot.name} » (${hours.length} h${marine ? '' : ', sans données mer'})`)
    return remember({ forecast, offline: false })
  } catch (e) {
    console.warn('Prévisions : échec du chargement, repli sur le cache.', e)
    const cached = await db.forecasts.get(id)
    return cached ? remember({ forecast: cached, offline: true }) : null
  }
}

/** Pleines et basses mers détectées dans la série de hauteur d'eau. */
export function findTides(hours: HourPoint[]): Tide[] {
  const out: Tide[] = []
  for (let i = 1; i < hours.length - 1; i++) {
    const p = hours[i - 1].seaLevel
    const c = hours[i].seaLevel
    const n = hours[i + 1].seaLevel
    if (p == null || c == null || n == null) continue
    if (c >= p && c > n) out.push({ ts: hours[i].ts, type: 'haute', height: c })
    else if (c <= p && c < n) out.push({ ts: hours[i].ts, type: 'basse', height: c })
  }
  return out
}

/** 0 = étale (mer haute/basse), 1 = plein courant (mi-marée). null si inconnu. */
export function tideFlow(ts: number, tides: Tide[]): number | null {
  const next = tides.findIndex((t) => t.ts >= ts)
  if (next <= 0) return null
  const a = tides[next - 1].ts
  const b = tides[next].ts
  return Math.sin((Math.PI * (ts - a)) / (b - a))
}
