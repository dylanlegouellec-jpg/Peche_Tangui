import { useEffect, useState, useSyncExternalStore } from 'react'
import { friendFeed, friendPhotoUrl, listFriends, removeFriend, requestFriend, respondFriend, type Friend, type FriendTrip, type Pending } from '../lib/friends'
import { getSyncState, subscribeSync } from '../lib/sync'

const fmt = (ms: number) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

function Pic({ uid, className, alt }: { uid?: string | null; className?: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (uid) friendPhotoUrl(uid).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [uid])
  return url ? <img src={url} alt={alt} className={className} /> : null
}

function Face({ name, uid }: { name: string; uid?: string | null }) {
  return (
    <span className="avatar" style={{ width: 36, height: 36, fontSize: 15 }}>
      {uid ? <Pic uid={uid} alt={name} /> : null}
      <span className="ini">{name.slice(0, 1).toUpperCase()}</span>
    </span>
  )
}

export function FriendsView({ onCount }: { onCount?: (n: number) => void }) {
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [friends, setFriends] = useState<Friend[]>([])
  const [incoming, setIncoming] = useState<Pending[]>([])
  const [outgoing, setOutgoing] = useState<Pending[]>([])
  const [feed, setFeed] = useState<FriendTrip[] | null>(null)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [manage, setManage] = useState(false)

  async function load() {
    try {
      const l = await listFriends()
      setFriends(l.friends)
      setIncoming(l.incoming)
      setOutgoing(l.outgoing)
      onCount?.(l.incoming.length)
      setFeed(await friendFeed())
      setError('')
    } catch (e) {
      setError(e instanceof TypeError ? 'Pas de connexion internet : les sorties de tes amis ne sont pas disponibles hors ligne.' : e instanceof Error ? e.message : 'Erreur')
      setFeed((f) => f ?? [])
    }
  }
  useEffect(() => {
    if (st.loggedIn) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.loggedIn])

  if (!st.loggedIn) return <p className="card muted">Connecte-toi (Réglages → Compte) pour ajouter des amis et voir leurs sorties.</p>

  const act = (fn: () => Promise<unknown>, ok?: string) => async () => {
    setMsg('')
    setError('')
    try {
      await fn()
      if (ok) setMsg(ok)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <>
      {incoming.length > 0 && (
        <div className="card">
          <h3>Demandes d’amis</h3>
          {incoming.map((p) => (
            <div className="row between friendrow" key={p.id}>
              <span>{p.name} <span className="muted small">{p.email}</span></span>
              <span className="row">
                <button className="primary" onClick={act(() => respondFriend(p.id, true))}>Accepter</button>
                <button onClick={act(() => respondFriend(p.id, false))}>Refuser</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="row between">
        <strong>Sorties de mes amis</strong>
        <button onClick={() => setManage((m) => !m)}>{manage ? 'Fermer' : `Mes amis (${friends.length})`}</button>
      </div>

      {manage && (
        <div className="card">
          <h3>Ajouter un ami</h3>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void act(() => requestFriend(email.trim()).then((r) => { setEmail(''); setMsg(r.status === 'accepted' ? 'Vous êtes maintenant amis.' : 'Demande envoyée.') }))() }}>
            <input type="email" placeholder="E-mail de ton ami" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" autoCorrect="off" />
            <button className="primary" disabled={!/\S+@\S+\.\S+/.test(email)}>Inviter</button>
          </form>
          <p className="muted small">Ton ami doit avoir un compte. Une fois la demande acceptée, vous voyez chacun les sorties de l’autre (spot, prises, photos, conditions), sauf celles que tu marques 🔒 privées. Les notes et les positions GPS de tes spots ne sont jamais partagées.</p>
          {friends.map((f) => (
            <div className="row between friendrow" key={f.id}>
              <span className="row"><Face name={f.name} uid={f.avatarUid} /> {f.name}</span>
              <button onClick={() => confirm(`Retirer ${f.name} de tes amis ?`) && act(() => removeFriend(f.id))()}>Retirer</button>
            </div>
          ))}
          {outgoing.map((p) => (
            <div className="row between friendrow" key={p.id}>
              <span className="muted">{p.email} · en attente</span>
              <button onClick={act(() => removeFriend(p.id))}>Annuler</button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
      {error && <p className="warn small">{error}</p>}

      {feed === null && <p className="muted">Chargement…</p>}
      {feed?.length === 0 && !error && <p className="muted">{friends.length ? 'Tes amis n’ont encore partagé aucune sortie.' : 'Ajoute un ami avec « Mes amis » pour voir ce qu’il pêche.'}</p>}
      <div className="cols-2">
        {feed?.map((t) => (
          <div className="card" key={t.uid}>
            <div className="row friendhead">
              <Face name={t.name} uid={t.avatarUid} />
              <div>
                <strong>{t.name}</strong>
                <div className="muted small">{t.spotName} · {t.mode === 'bord' ? 'du bord' : 'sous-marine'} · {fmt(t.date)}</div>
              </div>
            </div>
            <div>{t.catches.length ? t.catches.map((c) => c.species + (c.sizeCm ? ` ${c.sizeCm} cm` : '')).join(', ') : 'Bredouille'}</div>
            <div className="photos">{t.photoUids.slice(0, 3).map((u) => <Pic key={u} uid={u} alt="Prise" />)}</div>
            {t.snapshot && <p className="muted small">Conditions : vent {t.snapshot.wind != null ? `${Math.round(t.snapshot.wind)} km/h` : '?'} · houle {t.snapshot.wave?.toFixed(1) ?? '?'} m · eau {t.snapshot.seaTemp?.toFixed(1) ?? '?'} °C</p>}
          </div>
        ))}
      </div>
    </>
  )
}
