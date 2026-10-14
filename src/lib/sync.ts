import { db, DEFAULT_SPOTS } from './db'
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
// Compte auquel appartiennent les données de ce téléphone (gardé après déconnexion, pour ne jamais mélanger deux comptes).
const OWNER = 'peche-owner'
if (read(LS.token) && read(LS.email) && !read(OWNER)) write(OWNER, read(LS.email))

let state: SyncState = { loggedIn: !!read(LS.token), email: read(LS.email), status: 'idle', last: Number(read(LS.lastSync)) || null }
const listeners = new Set<() => void>()
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export const getSyncState = () => state
export const getSyncDebug = () => ({ cursor: Number(read(LS.cursor)) || null, lastPush: Number(read(LS.lastPush)) || null })
export const subscribeSync = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export async function api<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const token = read(LS.token)
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  if (r.status === 401 && token) {
    // Session expirée : on repart de zéro pour la prochaine connexion (un autre compte ne doit pas reprendre le curseur de celui-ci)
    for (const k of [LS.token, LS.cursor, LS.lastPush]) write(k, null)
    set({ loggedIn: false, email: null, status: 'idle' })
  }
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Erreur ${r.status}`)
  return r.json()
}

/** Retire de ce téléphone les données d'un autre compte (elles restent sauvegardées dans ce compte-là) et remet les spots de départ. */
async function clearLocalData() {
  await db.transaction('rw', db.spots, db.trips, db.photos, db.settings, async () => {
    await Promise.all([db.spots.clear(), db.trips.clear(), db.photos.clear(), db.settings.delete('main')])
    await db.spots.bulkAdd(DEFAULT_SPOTS.map((s) => ({ ...s, updatedAt: 1 })))
  })
}

async function signedIn(res: { token: string; email?: string }, email: string) {
  const account = (res.email ?? email).toLowerCase()
  const owner = read(OWNER)
  if (owner && owner.toLowerCase() !== account) {
    const ok = confirm(`Ce téléphone contient les données de ${owner}. Elles vont être retirées de ce téléphone (elles restent sauvegardées dans son compte) avant de charger celles de ${account}. Continuer ?`)
    if (!ok) throw new Error('Connexion annulée')
    await clearLocalData()
  }
  write(OWNER, account)
  write(LS.cursor, null)
  write(LS.lastPush, null)
  write(LS.token, res.token)
  write(LS.email, res.email ?? email)
  set({ loggedIn: true, email: res.email ?? email, error: undefined })
  await syncNow()
}

export const login = (email: string, password: string) => api<{ token: string; email?: string }>('auth', { action: 'login', email, password }).then((r) => signedIn(r, email))
/** Création de compte avec un code d'invitation. */
export const signup = (email: string, password: string, code: string) => api<{ token: string; email?: string }>('auth', { action: 'setup', email, password, code }).then((r) => signedIn(r, email))
/** Crée un code d'invitation à usage unique, valable 14 jours. */
export const createInvite = () => api<{ code: string; expiresAt: number }>('auth', { action: 'invite' })

export const authToken = () => read(LS.token)

export async function logout() {
  // Dernière synchro pour ne rien perdre (sans bloquer si le réseau manque)
  await syncNow().catch(() => undefined)
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

/** Photos introuvables sur le serveur, à ne pas redemander à chaque synchro. */
const missing = new Set<string>()
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
    // Une photo qui échoue ne bloque pas le reste : elle sera retentée à la prochaine synchro.
    let failed = 0
    for (const p of await db.photos.where('uploaded').equals(0).toArray()) {
      try {
        await api('photo', { uid: p.uid, tripUid: p.tripUid, data: await blobToBase64(p.blob) })
        await db.photos.update(p.uid, { uploaded: 1 })
      } catch (e) {
        if (!read(LS.token)) throw e // session expirée : inutile de continuer
        failed++
        console.warn(`Photo ${p.uid} non envoyée :`, e)
      }
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
      if (missing.has(uid) || (await db.photos.get(uid))) return
      const r = await fetch(`/api/photo?uid=${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${read(LS.token)}` } }).catch(() => null)
      if (r?.ok) await db.photos.put({ uid, tripUid, blob: await r.blob(), uploaded: 1 })
      else if (r?.status === 404) missing.add(uid) // absente du serveur : on ne la redemande plus pendant cette session
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
    set(failed ? { status: 'error', error: `${failed} photo${failed > 1 ? 's' : ''} non envoyée${failed > 1 ? 's' : ''}, nouvel essai à la prochaine synchro`, last: Date.now() } : { status: 'idle', last: Date.now() })
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
