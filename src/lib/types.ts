export type Mode = 'bord' | 'plongee'

export interface Spot {
  id?: number
  name: string
  lat: number
  lon: number
  notes?: string
  example?: boolean
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
}

export interface Sun {
  sunrise: number
  sunset: number
}

export interface Forecast {
  spotId: number
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
  date: number // ms
  spotId: number
  spotName: string
  mode: Mode
  notes?: string
  catches: CatchItem[]
  photos: Blob[]
  snapshot?: { wind: number | null; wave: number | null; seaTemp: number | null; pressure: number | null; score: number | null }
}
