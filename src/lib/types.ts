export type Mode = 'bord' | 'plongee'

export interface Spot {
  id?: number
  uid: string
  updatedAt: number
  deleted?: boolean
  name: string
  lat: number
  lon: number
  notes?: string
  /** Nature du fond / du lieu, pour l'icône et les infos du marqueur. */
  kind?: SpotKind
  /** Cap (°) vers lequel le spot fait face à la mer, ex. 225 = face au sud-ouest ; absent = spot en pleine mer ou inconnu. */
  facing?: number
  example?: boolean
}

export type SpotKind = 'roche' | 'sable' | 'epave' | 'port' | 'plage' | 'autre'

export const SPOT_KINDS: Record<SpotKind, string> = {
  roche: '🪨 Roche',
  sable: '🏖️ Sable',
  epave: '⚓ Épave',
  port: '🏗️ Port / digue',
  plage: '🌊 Plage',
  autre: '📍 Autre',
}

export interface HourPoint {
  ts: number // unix secondes
  wave: number | null // m
  wavePeriod: number | null // s
  seaTemp: number | null // °C
  seaLevel: number | null // m
  wind: number | null // km/h
  gust: number | null // km/h
  pressure: number | null // hPa
  precip: number | null // mm
  isDay: boolean
  temp?: number | null // °C, air
  feels?: number | null // °C, ressenti
  cloud?: number | null // %
  windDir?: number | null // ° d'où vient le vent
  vis?: number | null // m, visibilité atmosphérique
  uv?: number | null
  pop?: number | null // % probabilité de pluie
  waveDir?: number | null // ° d'où vient la houle
  current?: number | null // km/h (modèle, large)
  currentDir?: number | null // ° vers où va le courant
  curSrc?: 'cmems' // le courant vient de Copernicus (sinon Open-Meteo)
  waveSrc?: 'cmems'
}

export interface Sun {
  sunrise: number
  sunset: number
}

export interface Forecast {
  spotId: number
  lat?: number
  lon?: number
  /** Vrai si la partie mer (houle, marées) n'a pas pu être chargée : on retente vite. */
  noSea?: boolean
  fetchedAt: number
  hours: HourPoint[]
  sun: Sun[]
}

export interface Tide {
  ts: number
  type: 'haute' | 'basse'
  height: number
}

export interface Factor {
  label: string
  value: number // 0..1
  weight: number
  note: string
}

export interface HourScore {
  ts: number
  score: number
  factors: Factor[]
  warnings: string[]
}

export interface CatchItem {
  species: string
  sizeCm?: number
  weightKg?: number
}

export interface Trip {
  id?: number
  uid: string
  updatedAt: number
  deleted?: boolean
  date: number // ms
  spotId: number
  spotUid: string
  spotName: string
  mode: Mode
  notes?: string
  catches: CatchItem[]
  photoUids: string[]
  snapshot?: { airTemp?: number | null; wind: number | null; wave: number | null; seaTemp: number | null; pressure: number | null; score: number | null }
}

export type Theme = 'auto' | 'dark' | 'light'
export type WindUnit = 'kmh' | 'kt'

export interface Settings {
  theme: Theme
  windUnit: WindUnit
  defaultMode: Mode
  defaultSpotUid?: string
  /** Opacité du fond de la barre d'onglets, en % (20–100). */
  tabOpacity: number
  /** Nombre de jours de prévisions affichés (la rangée de jours et la liste). */
  forecastDays: number
  firstName?: string
  lastName?: string
  /** Identifiant de la photo de profil (table photos). */
  avatarUid?: string
}

export const DEFAULT_SETTINGS: Settings = { theme: 'auto', windUnit: 'kmh', defaultMode: 'bord', tabOpacity: 92, forecastDays: 8 }

export interface PhotoRow {
  uid: string
  tripUid: string
  blob: Blob
  uploaded: 0 | 1
}
