import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { getSyncState, subscribeSync } from '../lib/sync'
import type { Settings } from '../lib/types'

export function useAvatarUrl(uid?: string) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!uid) return setUrl(undefined)
    let current: string | undefined
    const sub = liveQuery(() => db.photos.get(uid)).subscribe((row) => {
      if (current) URL.revokeObjectURL(current)
      current = row ? URL.createObjectURL(row.blob) : undefined
      setUrl(current)
    })
    return () => {
      sub.unsubscribe()
      if (current) URL.revokeObjectURL(current)
    }
  }, [uid])
  return url
}

export const initials = (s: Pick<Settings, 'firstName' | 'lastName'>) => ((s.firstName?.[0] ?? '') + (s.lastName?.[0] ?? '')).toUpperCase()

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Pastille de connexion : vert = en ligne et synchronisé, orange = synchro en cours ou pas de compte, rouge = hors ligne ou échec. */
function useConnection(): { color: 'green' | 'orange' | 'red'; label: string } {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const sync = useSyncExternalStore(subscribeSync, getSyncState)
  if (!online) return { color: 'red', label: 'Hors ligne : tes données restent sur ce téléphone et seront synchronisées au retour du réseau' }
  if (!sync.loggedIn) return { color: 'orange', label: 'En ligne, mais pas connecté à un compte : tes données ne sont pas sauvegardées en ligne' }
  if (sync.status === 'error') return { color: 'red', label: `Échec de la synchronisation : ${sync.error ?? 'erreur'}` }
  if (sync.status === 'syncing') return { color: 'orange', label: 'Synchronisation en cours…' }
  if (sync.status === 'offline') return { color: 'red', label: 'Hors ligne' }
  return { color: 'green', label: 'En ligne et synchronisé' }
}

export function Avatar({ settings, size = 40, dot = false }: { settings: Settings; size?: number; dot?: boolean }) {
  const url = useAvatarUrl(settings.avatarUid)
  const conn = useConnection()
  const face = (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="Photo de profil" /> : initials(settings) || '🎣'}
    </span>
  )
  if (!dot) return face
  const d = Math.max(8, Math.round(size * 0.19))
  return (
    <span className="avatar-wrap" title={conn.label}>
      {face}
      <span className={`status-dot ${conn.color}`} style={{ width: d, height: d }} role="img" aria-label={conn.label} />
    </span>
  )
}
