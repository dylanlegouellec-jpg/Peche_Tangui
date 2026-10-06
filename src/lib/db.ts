import Dexie, { type EntityTable } from 'dexie'
import type { Forecast, Spot, Trip } from './types'

export const db = new Dexie('peche-tangui') as Dexie & {
  spots: EntityTable<Spot, 'id'>
  trips: EntityTable<Trip, 'id'>
  forecasts: EntityTable<Forecast, 'spotId'>
}

db.version(1).stores({
  spots: '++id',
  trips: '++id, date, spotId',
  forecasts: 'spotId',
})

// Spots d'exemple dans le Morbihan, à remplacer par les vrais coins.
const EXAMPLES: Spot[] = [
  { name: 'Quiberon – Port-Maria', lat: 47.4833, lon: -3.1167, example: true },
  { name: 'Carnac – plage', lat: 47.5667, lon: -3.0667, example: true },
  { name: 'Port-Louis', lat: 47.7083, lon: -3.3544, example: true },
  { name: 'Port-Navalo', lat: 47.5486, lon: -2.9172, example: true },
  { name: 'Île de Houat', lat: 47.3917, lon: -2.9553, example: true },
]

export async function seedSpots() {
  if ((await db.spots.count()) === 0) await db.spots.bulkAdd(EXAMPLES)
}
