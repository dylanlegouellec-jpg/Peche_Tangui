import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_SETTINGS, type Forecast, type Settings, type Spot, type Trip } from './types'

export const db = new Dexie('peche-tangui') as Dexie & {
  spots: EntityTable<Spot, 'id'>
  trips: EntityTable<Trip, 'id'>
  forecasts: EntityTable<Forecast, 'spotId'>
  settings: EntityTable<{ key: string; value: unknown }, 'key'>
}

db.version(1).stores({
  spots: '++id',
  trips: '++id, date, spotId',
  forecasts: 'spotId',
})
db.version(2).stores({ settings: 'key' })

// Spots de départ (Morbihan). Coordonnées approximatives : à ajuster sur place avec « Placer ici ».
const DEFAULT_SPOTS: Spot[] = [
  { name: 'Roche du Maguero', lat: 47.69, lon: -3.27, notes: 'Position approximative, à corriger sur place.' },
  { name: 'Port d’Étel', lat: 47.6577, lon: -3.201 },
  { name: 'Portivy', lat: 47.5294, lon: -3.1444 },
]

export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) }
}

export async function saveSettings(patch: Partial<Settings>) {
  await db.settings.put({ key: 'main', value: { ...(await loadSettings()), ...patch } })
}

/** Remplace les spots d'exemple de la première version par les vrais coins, une seule fois. */
export async function seedSpots() {
  if ((await db.settings.get('seeded'))?.value) return
  const spots = await db.spots.toArray()
  if (spots.every((s) => s.example)) {
    await db.spots.clear()
    await db.spots.bulkAdd(DEFAULT_SPOTS)
  }
  await db.settings.put({ key: 'seeded', value: true })
}
