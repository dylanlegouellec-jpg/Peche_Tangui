import { api, authToken } from './sync'

export interface Friend { id: number; name: string; avatarUid?: string | null }
export interface Pending { id: number; name: string; email: string }
export interface FriendTrip {
  uid: string
  friendId: number
  name: string
  avatarUid?: string | null
  date: number
  spotName: string
  mode: 'bord' | 'plongee'
  catches: { species: string; sizeCm?: number; weightKg?: number }[]
  photoUids: string[]
  snapshot: { airTemp?: number | null; wind: number | null; wave: number | null; seaTemp: number | null; pressure: number | null; score: number | null } | null
}

export const listFriends = () => api<{ friends: Friend[]; incoming: Pending[]; outgoing: Pending[] }>('friends', { action: 'list' })
export const requestFriend = (email: string) => api<{ status: 'pending' | 'accepted' }>('friends', { action: 'request', email })
export const respondFriend = (id: number, accept: boolean) => api('friends', { action: 'respond', id, accept })
export const removeFriend = (id: number) => api('friends', { action: 'remove', id })
export const friendFeed = () => api<{ trips: FriendTrip[] }>('friends', { action: 'feed' }).then((r) => r.trips)

// Photos d'amis : récupérées avec le jeton, gardées en mémoire le temps de la session.
const urls = new Map<string, Promise<string | null>>()
export function friendPhotoUrl(uid: string): Promise<string | null> {
  let p = urls.get(uid)
  if (!p) {
    p = fetch(`/api/photo?uid=${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${authToken()}` } })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null)
    urls.set(uid, p)
    p.then((u) => !u && urls.delete(uid))
  }
  return p
}
