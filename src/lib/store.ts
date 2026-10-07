import { db, loadSettings } from './db'
import { scheduleSync } from './sync'
import type { CatchItem, Mode, Settings, Spot, Trip } from './types'

const touch = () => scheduleSync()

export const liveSpots = () => db.spots.toArray().then((l) => l.filter((s) => !s.deleted))

export async function addSpot(s: Pick<Spot, 'name' | 'lat' | 'lon'> & Partial<Pick<Spot, 'kind' | 'notes' | 'facing'>>) {
  await db.spots.add({ ...s, uid: crypto.randomUUID(), updatedAt: Date.now() })
  touch()
}

export async function updateSpot(id: number, patch: Partial<Spot>) {
  await db.spots.update(id, { ...patch, updatedAt: Date.now() })
  touch()
}

export async function removeSpot(id: number) {
  await updateSpot(id, { deleted: true })
}

export async function saveSettings(patch: Partial<Settings>) {
  await db.settings.put({ key: 'main', value: { ...(await loadSettings()), ...patch }, updatedAt: Date.now() })
  touch()
}

/** Remplace la photo de profil (nouvel identifiant à chaque fois : les photos ne changent jamais une fois envoyées). */
export async function setAvatar(blob: Blob) {
  const old = (await loadSettings()).avatarUid
  const uid = crypto.randomUUID()
  await db.photos.add({ uid, tripUid: 'profile', blob, uploaded: 0 })
  if (old) await db.photos.delete(old)
  await saveSettings({ avatarUid: uid })
}

export interface NewTrip {
  date: number
  spot: Spot
  mode: Mode
  notes?: string
  catches: CatchItem[]
  photos: Blob[]
  snapshot?: Trip['snapshot']
  private?: boolean
}

export async function addTrip(t: NewTrip) {
  const uid = crypto.randomUUID()
  const photoUids = t.photos.map(() => crypto.randomUUID())
  await db.transaction('rw', db.trips, db.photos, async () => {
    await db.photos.bulkAdd(t.photos.map((blob, i) => ({ uid: photoUids[i], tripUid: uid, blob, uploaded: 0 as const })))
    await db.trips.add({ uid, updatedAt: Date.now(), date: t.date, spotId: t.spot.id!, spotUid: t.spot.uid, spotName: t.spot.name, mode: t.mode, notes: t.notes, catches: t.catches, photoUids, snapshot: t.snapshot, private: t.private || undefined })
  })
  touch()
}

export async function setTripPrivate(id: number, value: boolean) {
  await db.trips.update(id, { private: value || undefined, updatedAt: Date.now() })
  touch()
}

export async function removeTrip(id: number) {
  await db.trips.update(id, { deleted: true, updatedAt: Date.now() })
  touch()
}

export const liveTrips = () => db.trips.orderBy('date').reverse().toArray().then((l) => l.filter((t) => !t.deleted))

export async function photoBlobs(uids: string[]): Promise<Blob[]> {
  const rows = await db.photos.bulkGet(uids)
  return rows.flatMap((r) => (r ? [r.blob] : []))
}

/** Télécharge toutes les données (spots, sorties, photos incluses) dans un fichier JSON. */
export async function exportBackup() {
  const toUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })
  const [spots, trips] = await Promise.all([liveSpots(), liveTrips()])
  const rows = await Promise.all(trips.map(async (t) => ({ ...t, photos: await Promise.all((await photoBlobs(t.photoUids)).map(toUrl)) })))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ spots, trips: rows, settings: await loadSettings() }, null, 1)], { type: 'application/json' }))
  a.download = `peche-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
}
