import { compass, swellFactor, windKind, WIND_LABEL } from './exposure'
import { coefficientAt } from './tides'
import { tideFlow } from './forecast'
import type { Factor, Forecast, HourPoint, HourScore, Mode, Tide, WindUnit } from './types'

export const fmtWind = (kmh: number, unit: WindUnit) => (unit === 'kt' ? `${Math.round(kmh / 1.852)} nds` : `${Math.round(kmh)} km/h`)

const clamp = (v: number) => Math.max(0, Math.min(1, v))
/** Interpolation linéaire : `good` → 1, `bad` → 0. */
const ramp = (v: number, good: number, bad: number) => clamp((v - bad) / (good - bad))

function nearSun(ts: number, forecast: Forecast): 'aube' | 'crepuscule' | null {
  for (const s of forecast.sun) {
    if (Math.abs(ts - s.sunrise) <= 5400) return 'aube'
    if (Math.abs(ts - s.sunset) <= 5400) return 'crepuscule'
  }
  return null
}

function pressureTrend(i: number, hours: HourPoint[]): number | null {
  const a = hours[i].pressure
  const b = hours[Math.max(0, i - 6)].pressure
  return a == null || b == null ? null : a - b
}

function past48(i: number, hours: HourPoint[]) {
  const slice = hours.slice(Math.max(0, i - 48), i + 1)
  const waves = slice.map((h) => h.wave).filter((v): v is number => v != null)
  return {
    maxWave: waves.length ? Math.max(...waves) : null,
    rain: slice.reduce((s, h) => s + (h.precip ?? 0), 0),
  }
}

export interface ScoreContext {
  /** Cap vers lequel le spot regarde la mer (°). */
  facing?: number
  /** Dernière chlorophylle satellite autour du spot. */
  chl?: { value: number; ageDays: number }
}

export function scoreHour(i: number, forecast: Forecast, tides: Tide[], mode: Mode, unit: WindUnit = 'kmh', ctx: ScoreContext = {}): HourScore {
  const hours = forecast.hours
  const h = hours[i]
  const factors: Factor[] = []
  const warnings: string[] = []
  const add = (label: string, value: number, weight: number, note: string) =>
    factors.push({ label, value: clamp(value), weight, note })

  const windEff = h.wind == null ? null : Math.max(h.wind, (h.gust ?? 0) * 0.7)
  const kind = ctx.facing != null && h.windDir != null ? windKind(h.windDir, ctx.facing) : null
  const windNote = `${fmtWind(h.wind ?? 0, unit)} (rafales ${fmtWind(h.gust ?? 0, unit)})${h.windDir != null ? ` · ${compass(h.windDir)}` : ''}${kind ? ` · ${WIND_LABEL[kind]}` : ''}`
  // Houle ressentie : réduite si le spot est abrité de la direction d'où vient la houle.
  const share = ctx.facing != null && h.waveDir != null ? swellFactor(h.waveDir, ctx.facing) : 1
  const waveEff = h.wave == null ? null : h.wave * share
  const waveNote = h.wave == null ? '' : `${h.wave.toFixed(1)} m${h.waveDir != null ? ` de ${compass(h.waveDir)}` : ''}${h.wavePeriod != null ? ` · ${h.wavePeriod.toFixed(0)} s` : ''}${share < 0.95 ? ` → ressentie ${waveEff!.toFixed(1)} m (${share < 0.7 ? 'abrité' : 'en partie abrité'})` : ''}`
  const flow = tideFlow(h.ts, tides)
  const sun = nearSun(h.ts, forecast)
  const hour = Number(new Date(h.ts * 1000).toLocaleString('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }))

  if (mode === 'bord') {
    if (windEff != null) add('Vent', ramp(windEff * (kind === 'mer' ? 1.15 : 1), 12, 45), 2, windNote)
    if (waveEff != null) {
      const v = waveEff < 0.4 ? 0.8 : waveEff <= 1.2 ? 1 : ramp(waveEff, 1.2, 3)
      add('Houle', v, 2, waveNote)
      if (waveEff > 2.5) warnings.push('Mer forte : reste loin des rochers exposés.')
    }
    if (flow != null) add('Marée', 0.4 + 0.6 * flow, 2, flow > 0.6 ? 'Eau en mouvement' : 'Proche de l’étale')
    add('Lumière', sun ? 1 : !h.isDay ? 0.6 : hour >= 11 && hour <= 15 ? 0.5 : 0.7, 1.5, sun === 'aube' ? 'Aube' : sun === 'crepuscule' ? 'Crépuscule' : h.isDay ? 'Plein jour' : 'Nuit')
    const dp = pressureTrend(i, hours)
    if (dp != null) add('Pression', dp > 6 || dp < -8 ? 0.5 : dp >= -6 && dp <= 2 ? 1 : 0.7, 1, `${dp >= 0 ? '+' : ''}${dp.toFixed(1)} hPa / 6 h`)
    const coef = coefficientAt(h.ts)
    add('Coefficient', coef >= 70 ? 1 : coef >= 50 ? 0.7 : 0.5, 1, `${coef}`)
  } else {
    if (waveEff != null) {
      add('Houle', ramp(waveEff, 0.3, 1.5), 2, waveNote)
      if (waveEff > 1) warnings.push('Mer formée : sortie déconseillée.')
    }
    if (windEff != null) add('Vent', ramp(windEff * (kind === 'mer' ? 1.15 : 1), 10, 35), 2, windNote)
    if (windEff != null && windEff > 30) warnings.push('Vent fort : mise à l’eau et retour difficiles.')
    if (kind === 'terre' && windEff != null && windEff > 15) warnings.push('Vent de terre : risque de dérive vers le large, reste près de la côte ou de ton bateau.')
    if (h.current != null) {
      add('Courant (modèle)', ramp(h.current, 1, 4), 1, `${h.current.toFixed(1)} km/h${h.currentDir != null ? ` vers ${compass(h.currentDir)}` : ''} · modèle large, les courants de marée côtiers sont plus forts`)
      if (h.current > 4) warnings.push('Courant marqué : plongée à étale seulement.')
    }
    if (flow != null) add('Courant', 1 - flow, 2, flow < 0.3 ? 'Étale, idéal' : flow > 0.8 ? 'Courant fort' : 'Courant modéré')
    const p = past48(i, hours)
    const waveV = p.maxWave == null ? null : ramp(p.maxWave, 0.8, 2.5) * 0.8 + 0.2
    const rainV = ramp(p.rain, 2, 20) * 0.8 + 0.2
    let vis = waveV == null ? rainV : (waveV + rainV) / 2
    let visNote = `houle max 48 h : ${p.maxWave?.toFixed(1) ?? '?'} m · pluie 48 h : ${p.rain.toFixed(0)} mm`
    const ahead = (h.ts - Date.now() / 1000) / 86400
    // Chlorophylle satellite : valable pour aujourd'hui et les 3 jours suivants (l'eau change lentement), sinon on s'en passe.
    if (ctx.chl && ahead < 3) {
      const chlV = ramp(ctx.chl.value, 1.5, 8) * 0.8 + 0.2
      vis = (vis + chlV) / 2
      visNote += ` · chlorophylle ${ctx.chl.value.toFixed(1)} mg/m³ (il y a ${ctx.chl.ageDays} j)`
    }
    add('Visibilité (estimée)', vis, 2.5, visNote)
    if (!h.isDay) {
      add('Lumière', 0, 1, 'Nuit')
      warnings.push('Nuit : pas de plongée.')
    } else add('Lumière', hour >= 10 && hour <= 16 ? 1 : 0.6, 1, hour >= 10 && hour <= 16 ? 'Soleil haut' : 'Lumière basse')
    if (h.seaTemp != null) add('Eau', ramp(h.seaTemp, 16, 11) * 0.7 + 0.3, 0.5, `${h.seaTemp.toFixed(1)} °C`)
  }

  const total = factors.reduce((s, f) => s + f.weight, 0)
  let score = total ? Math.round((factors.reduce((s, f) => s + f.value * f.weight, 0) / total) * 100) : 0
  // Sans houle ni marée (prévisions au-delà de 8 jours), le score est ramené vers le neutre : il ne peut pas être « parfait ».
  if (h.wave == null) score = Math.round(score * 0.7 + 50 * 0.3)
  return { ts: h.ts, score, factors, warnings }
}

export function scoreSeries(forecast: Forecast, tides: Tide[], mode: Mode, fromTs: number, unit: WindUnit = 'kmh', ctx: ScoreContext = {}): HourScore[] {
  const out: HourScore[] = []
  forecast.hours.forEach((h, i) => {
    if (h.ts >= fromTs - 3600) out.push(scoreHour(i, forecast, tides, mode, unit, ctx))
  })
  return out
}

export interface Window {
  key: string
  day: string
  start: number
  end: number
  avg: number
}

/** Date locale (Paris) au format AAAA-MM-JJ, pour regrouper les heures par jour. */
export const dayKey = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
export const dayLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'short' })

/** Meilleur créneau de 2 h consécutives pour chaque jour présent dans la série. */
export function bestWindows(series: HourScore[]): Window[] {
  const byDay = new Map<string, HourScore[]>()
  for (const s of series) {
    const k = dayKey(s.ts)
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }
  const result: Window[] = []
  for (const [key, list] of byDay) {
    let best: Window | null = null
    for (let i = 0; i < list.length - 1; i++) {
      const avg = (list[i].score + list[i + 1].score) / 2
      if (!best || avg > best.avg) best = { key, day: dayLabel(list[i].ts), start: list[i].ts, end: list[i + 1].ts + 3600, avg: Math.round(avg) }
    }
    if (best) result.push(best)
  }
  return result
}
