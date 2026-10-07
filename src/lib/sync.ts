import { db } from './db'
import type { Spot, Trip } from './types'

const LS = { token: 'peche-token', email: 'peche-email', cursor: 'peche-cursor', lastPush: 'peche-last-push', lastSync: 'peche-last-sync' }
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* stockage indisponible */
  }
}

export interface SyncState {
  loggedIn: boolean
  email: string | null
  status: 'idle' | 'syncing' | 'error' | 'offline'
  last: number | null
  error?: string
}
let state: SyncState = { loggedIn: !!read(LS.token), email: read(LS.email), status: 'idle', last: Number(read(LS.lastSync)) || null }
const listeners = new Set<() => void>()
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export const getSyncState = () => state
export const getSyncDebug = () => ({ cursor: Number(read(LS.cursor)) || null, lastPush: Number(read(LS.lastPush)) || null })
export const subscribeSync = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

async function api<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const token = read(LS.token)
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  if (r.status === 401 && token) {
    write(LS.token, null)
    set({ loggedIn: false, email: null, status: 'idle' })
  }
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Erreur ${r.status}`)
  return r.json()
}

async function signedIn(res: { token: string; email?: string }, email: string) {
  write(LS.token, res.token)
  write(LS.email, res.email ?? email)
  set({ loggedIn: true, email: res.email ?? email, error: undefined })
  await syncNow()
}

export const login = (email: string, password: string) => api<{ token: string; email?: string }>('auth', { action: 'login', email, password }).then((r) => signedIn(r, email))
/** Création de compte, étape 1 : un code à 6 chiffres est envoyé par e-mail. */
export const startSignup = (email: string, password: string) => api<{ sent: boolean }>('auth', { action: 'start', email, password })
/** Étape 2 : le code reçu crée le compte et connecte. */
export const verifySignup = (email: string, code: string) => api<{ token: string; email?: string }>('auth', { action: 'verify', email, code }).then((r) => signedIn(r, email))

export function logout() {
  Object.values(LS).forEach((k) => write(k, null))
  set({ loggedIn: false, email: null, status: 'idle', last: null, error: undefined })
}

interface Doc {
  uid: string
  data: Record<string, unknown>
  updatedAt: number
  deleted?: boolean
}
const toDoc = <T extends { id?: number; uid: string; updatedAt: number; deleted?: boolean }>(x: T): Doc => {
  const { id: _id, uid, updatedAt, deleted, ...data } = x
  void _id
  return { uid, updatedAt, deleted, data }
}

const blobToBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(b)
  })

let running = false
let again = false

/** Envoie les modifications locales, récupère celles du serveur (la plus récente gagne), puis synchronise les photos. */
export async function syncNow() {
  if (!read(LS.token)) return
  if (running) return void (again = true)
  if (!navigator.onLine) return set({ status: 'offline' })
  running = true
  set({ status: 'syncing', error: undefined })
  try {
    const startedAt = Date.now()
    const lastPush = Number(read(LS.lastPush)) || 0
    const spots = (await db.spots.toArray()).filter((s) => s.updatedAt > lastPush)
    const trips = (await db.trips.toArray()).filter((t) => t.updatedAt > lastPush)
    const sRow = await db.settings.get('main')

    // Photos d'abord, pour que le serveur les ait quand une sortie arrive.
    for (const p of await db.photos.where('uploaded').equals(0).toArray()) {
      await api('photo', { uid: p.uid, tripUid: p.tripUid, data: await blobToBase64(p.blob) })
      await db.photos.update(p.uid, { uploaded: 1 })
    }

    const res = await api<{ cursor: number; spots: Doc[]; trips: Doc[]; settings: { data: unknown; updatedAt: number } | null }>('sync', {
      since: Number(read(LS.cursor)) || 0,
      spots: spots.map(toDoc),
      trips: trips.map(toDoc),
      settings: sRow?.updatedAt && sRow.updatedAt > lastPush ? { data: sRow.value, updatedAt: sRow.updatedAt } : undefined,
    })

    await db.transaction('rw', db.spots, db.trips, db.settings, async () => {
      for (const d of res.spots) {
        const local = await db.spots.where('uid').equals(d.uid).first()
        if (local && local.updatedAt >= d.updatedAt) continue
        const row = { ...(d.data as Omit<Spot, 'uid' | 'updatedAt'>), uid: d.uid, updatedAt: d.updatedAt, deleted: d.deleted }
        if (local) await db.spots.put({ ...row, id: local.id })
        else await db.spots.add(row)
      }
      for (const d of res.trips) {
        const local = await db.trips.where('uid').equals(d.uid).first()
        if (local && local.updatedAt >= d.updatedAt) continue
        const data = d.data as Omit<Trip, 'uid' | 'updatedAt'>
        const spot = await db.spots.where('uid').equals(data.spotUid).first()
        const row = { ...data, spotId: spot?.id ?? data.spotId, uid: d.uid, updatedAt: d.updatedAt, deleted: d.deleted }
        if (local) await db.trips.put({ ...row, id: local.id })
        else await db.trips.add(row)
      }
      const mine = await db.settings.get('main')
      if (res.settings && (mine?.updatedAt ?? 0) < res.settings.updatedAt) await db.settings.put({ key: 'main', value: res.settings.data, updatedAt: res.settings.updatedAt })
    })

    // Photos reçues d'un autre appareil : sorties et photo de profil.
    const fetchPhoto = async (uid: string, tripUid: string) => {
      if (await db.photos.get(uid)) return
      const r = await fetch(`/api/photo?uid=${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${read(LS.token)}` } })
      if (r.ok) await db.photos.put({ uid, tripUid, blob: await r.blob(), uploaded: 1 })
    }
    for (const t of await db.trips.toArray()) {
      if (!t.deleted) for (const uid of t.photoUids) await fetchPhoto(uid, t.uid)
    }
    const avatarUid = ((await db.settings.get('main'))?.value as { avatarUid?: string } | undefined)?.avatarUid
    if (avatarUid) await fetchPhoto(avatarUid, 'profile')

    write(LS.cursor, String(res.cursor))
    write(LS.lastPush, String(startedAt))
    write(LS.lastSync, String(Date.now()))
    console.info(`Synchro ok : ${spots.length} spot(s) et ${trips.length} sortie(s) envoyés, ${res.spots.length + res.trips.length} reçu(s)`)
    set({ status: 'idle', last: Date.now() })
  } catch (e) {
    console.warn('Synchro échouée :', e)
    set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
    if (again) {
      again = false
      setTimeout(syncNow, 500)
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
export function scheduleSync() {
  clearTimeout(timer)
  timer = setTimeout(syncNow, 1500)
}

/** Synchronisation automatique : au lancement, au retour du réseau, au retour sur l'appli, puis toutes les 5 min. */
export function startAutoSync() {
  const run = () => void syncNow()
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
  setInterval(run, 5 * 60 * 1000)
  run()
}
