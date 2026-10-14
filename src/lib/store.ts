import { db, loadSettings } from './db'
import { scheduleSync } from './sync'
import type { CatchItem, Mode, Settings, Spot, Trip } from './types'

const touch = () => scheduleSync()

export const liveSpots = () => db.spots.toArray().then((l) => l.filter((s) => !s.deleted))

export async function addSpot(s: Pick<Spot, 'name' | 'lat' | 'lon'> & Partial<Pick<Spot, 'kind' | 'notes' | 'facing' | 'pin'>>) {
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
  const trip = await db.trips.get(id)
  await db.transaction('rw', db.trips, db.photos, async () => {
    await db.trips.update(id, { deleted: true, updatedAt: Date.now() })
    // Photos de la sortie : supprimées ici (et sur le serveur à la prochaine synchro)
    if (trip?.photoUids.length) await db.photos.bulkDelete(trip.photoUids)
  })
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

const dataUrlToBlob = (url: string) => {
  const [head, b64] = url.split(',')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg' })
}

/**
 * Restaure un fichier de sauvegarde : ajoute les spots, sorties et photos absents ou supprimés depuis, et remplace ceux qui sont plus anciens que la sauvegarde.
 * Rien n'est effacé. Les éléments restaurés seront renvoyés sur le compte à la prochaine synchro.
 */
export async function importBackup(file: File): Promise<{ spots: number; trips: number; photos: number }> {
  let data: { spots?: Spot[]; trips?: (Trip & { photos?: string[] })[] }
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde de l’appli')
  }
  if (!Array.isArray(data.spots) || !Array.isArray(data.trips)) throw new Error('Ce fichier n’est pas une sauvegarde de l’appli')
  // Photos décodées avant la transaction (la base locale n'accepte pas d'attente extérieure pendant une transaction)
  const photoRows = data.trips.flatMap((t) => (t.photos ?? []).flatMap((url, i) => (t.photoUids?.[i] && typeof url === 'string' && url.startsWith('data:') ? [{ uid: t.photoUids[i], tripUid: t.uid, blob: dataUrlToBlob(url), uploaded: 0 as const }] : [])))
  const now = Date.now()
  const count = { spots: 0, trips: 0, photos: 0 }
  await db.transaction('rw', db.spots, db.trips, db.photos, async () => {
    for (const s of data.spots!) {
      if (!s?.uid || typeof s.lat !== 'number') continue
      const { id: _id, ...rest } = s
      void _id
      const local = await db.spots.where('uid').equals(s.uid).first()
      if (local && !local.deleted && local.updatedAt >= s.updatedAt) continue
      if (local) await db.spots.put({ ...rest, id: local.id, deleted: undefined, updatedAt: now })
      else await db.spots.add({ ...rest, updatedAt: now })
      count.spots++
    }
    for (const t of data.trips!) {
      if (!t?.uid || typeof t.date !== 'number') continue
      const { id: _id, photos: _p, ...rest } = t
      void _id
      void _p
      const local = await db.trips.where('uid').equals(t.uid).first()
      if (local && !local.deleted && local.updatedAt >= t.updatedAt) continue
      const spot = await db.spots.where('uid').equals(t.spotUid).first()
      const row = { ...rest, spotId: spot?.id ?? rest.spotId, photoUids: rest.photoUids ?? [], catches: rest.catches ?? [], updatedAt: now }
      if (local) await db.trips.put({ ...row, id: local.id, deleted: undefined })
      else await db.trips.add(row)
      count.trips++
    }
    for (const p of photoRows) {
      if (await db.photos.get(p.uid)) continue
      await db.photos.add(p)
      count.photos++
    }
  })
  touch()
  return count
}
