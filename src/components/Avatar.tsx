import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
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

export function Avatar({ settings, size = 40 }: { settings: Settings; size?: number }) {
  const url = useAvatarUrl(settings.avatarUid)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="Photo de profil" /> : initials(settings) || '🎣'}
    </span>
  )
}
