import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_SETTINGS, type Forecast, type PhotoRow, type Settings, type Spot, type Trip } from './types'

export interface SettingsRow {
  key: string
  value: unknown
  updatedAt?: number
}

export const db = new Dexie('peche-tangui') as Dexie & {
  spots: EntityTable<Spot, 'id'>
  trips: EntityTable<Trip, 'id'>
  forecasts: EntityTable<Forecast, 'spotId'>
  settings: EntityTable<SettingsRow, 'key'>
  photos: EntityTable<PhotoRow, 'uid'>
}

db.version(1).stores({
  spots: '++id',
  trips: '++id, date, spotId',
  forecasts: 'spotId',
})
db.version(2).stores({ settings: 'key' })
db.version(3)
  .stores({ spots: '++id, &uid', trips: '++id, date, spotId, &uid', photos: 'uid, tripUid, uploaded' })
  .upgrade(async (tx) => {
    const now = Date.now()
    const spotUid = new Map<number, string>()
    await tx.table('spots').toCollection().modify((s: Spot) => {
      s.uid ??= crypto.randomUUID()
      s.updatedAt ??= now
      spotUid.set(s.id!, s.uid)
    })
    await tx.table('trips').toCollection().modify((t: Trip & { photos?: Blob[] }) => {
      t.uid ??= crypto.randomUUID()
      t.updatedAt ??= now
      t.spotUid ??= spotUid.get(t.spotId) ?? ''
      t.photoUids = (t.photos ?? []).map((blob) => {
        const uid = crypto.randomUUID()
        void tx.table('photos').add({ uid, tripUid: t.uid, blob, uploaded: 0 })
        return uid
      })
      delete t.photos
    })
  })

// Spots de départ (Morbihan), identifiants fixes pour ne pas être dupliqués d'un appareil à l'autre.
// Coordonnées approximatives : à ajuster sur place avec « Placer ici ».
const DEFAULT_SPOTS: Omit<Spot, 'id' | 'updatedAt'>[] = [
  { uid: 'seed-maguero', name: 'Roche du Maguero', lat: 47.69, lon: -3.27, notes: 'Position approximative, à corriger sur place.' },
  { uid: 'seed-etel', name: 'Port d’Étel', lat: 47.6577, lon: -3.201 },
  { uid: 'seed-portivy', name: 'Portivy', lat: 47.5294, lon: -3.1444 },
]

export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) }
}

/** Remplace les spots d'exemple de la première version par les vrais coins, une seule fois. */
export async function seedSpots() {
  if ((await db.settings.get('seeded'))?.value) return
  const spots = (await db.spots.toArray()).filter((s) => !s.deleted)
  if (spots.every((s) => s.example)) {
    // updatedAt = 1 : toute modification réelle (ici ou sur un autre appareil) l'emporte.
    await db.transaction('rw', db.spots, async () => {
      await db.spots.clear()
      await db.spots.bulkAdd(DEFAULT_SPOTS.map((s) => ({ ...s, updatedAt: 1 })))
    })
  }
  await db.settings.put({ key: 'seeded', value: true })
}
