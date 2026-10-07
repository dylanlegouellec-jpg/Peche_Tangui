import { useEffect, useState, useSyncExternalStore } from 'react'
import { authenticate, createInvite, getSyncState, isAdmin, logout, subscribeSync, syncNow } from '../lib/sync'

const params = new URLSearchParams(location.search)

export function AccountCard() {
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [create, setCreate] = useState(params.has('setup'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(params.get('setup') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [admin, setAdmin] = useState(false)
  const [invite, setInvite] = useState<{ code: string; link: string; expiresAt: number } | null>(null)
  const [inviteMsg, setInviteMsg] = useState('')
  useEffect(() => {
    if (st.loggedIn) isAdmin().then(setAdmin, () => setAdmin(false))
    else setAdmin(false)
  }, [st.loggedIn])

  async function makeInvite() {
    setInviteMsg('')
    try {
      const r = await createInvite()
      setInvite({ code: r.code, link: `${location.origin}/?setup=${r.code}`, expiresAt: r.expiresAt })
    } catch (err) {
      setInviteMsg(err instanceof TypeError ? 'Pas de connexion internet.' : err instanceof Error ? err.message : 'Erreur')
    }
  }
  async function shareInvite() {
    if (!invite) return
    const text = `Voici ton invitation pour l’appli de pêche : ${invite.link}`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setInviteMsg('Lien copié.')
      }
    } catch {
      /* partage annulé */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await authenticate(create ? 'setup' : 'login', email.trim(), password, code.trim())
      setPassword('')
    } catch (err) {
      setError(err instanceof TypeError ? 'Pas de connexion internet.' : err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (st.loggedIn) {
    const label = st.status === 'syncing' ? 'Synchronisation…' : st.status === 'offline' ? 'Hors ligne : synchro dès le retour du réseau' : st.status === 'error' ? `Échec : ${st.error}` : st.last ? `Synchronisé à ${new Date(st.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Pas encore synchronisé'
    return (
      <div className="card">
        <h3>Connecté</h3>
        {st.email && <p><strong>{st.email}</strong></p>}
        <p className={st.status === 'error' ? 'warn' : 'muted'}>{label}</p>
        <div className="row">
          <button onClick={() => syncNow()} disabled={st.status === 'syncing'}>Synchroniser maintenant</button>
          <button onClick={() => confirm('Se déconnecter ? Les données restent sur ce téléphone mais ne seront plus sauvegardées en ligne.') && logout()}>Déconnexion</button>
        </div>
        <p className="muted small">Spots, sorties, photos et réglages sont sauvegardés en ligne et synchronisés entre tes appareils.</p>
        {admin && (
          <div className="invite">
            <strong>Inviter quelqu’un</strong>
            <p className="muted small">Crée un code à usage unique (valable 14 jours). La personne aura son propre compte, avec ses propres données.</p>
            {invite ? (
              <>
                <p><code>{invite.code}</code></p>
                <p className="muted small">Valable jusqu’au {new Date(invite.expiresAt).toLocaleDateString('fr-FR')}. Elle ouvre le lien, ou entre le code dans Réglages → Compte → Créer un compte.</p>
                <div className="row">
                  <button onClick={shareInvite}>Envoyer le lien</button>
                  <button onClick={makeInvite}>Autre code</button>
                </div>
              </>
            ) : (
              <button onClick={makeInvite}>Créer un code d’invitation</button>
            )}
            {inviteMsg && <p className="muted small">{inviteMsg}</p>}
          </div>
        )}
      </div>
    )
  }

  const ready = /\S+@\S+\.\S+/.test(email) && password.length >= 8 && (!create || code.trim().length > 0)
  return (
    <form className="card" onSubmit={submit}>
      <div className="seg full" role="group" aria-label="Mode">
        <button type="button" className={!create ? 'on' : ''} onClick={() => { setCreate(false); setError('') }}>Se connecter</button>
        <button type="button" className={create ? 'on' : ''} onClick={() => { setCreate(true); setError('') }}>Créer un compte</button>
      </div>
      <p className="muted small">{create ? 'À faire une seule fois. Il te faut un code d’installation (chaque code ne crée qu’un compte).' : 'Connecte-toi pour sauvegarder tes données en ligne. Sans compte, tout reste sur ce téléphone.'}</p>
      <input type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="off" autoCorrect="off" />
      <input type="password" placeholder={create ? 'Mot de passe (8 caractères min.)' : 'Mot de passe'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} />
      {create && <input placeholder="Code d’installation" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" />}
      {!ready && (email || password) && <p className="muted small">{!/\S+@\S+\.\S+/.test(email) ? 'Entre une adresse e-mail valide. ' : ''}{password.length < 8 ? 'Mot de passe : 8 caractères minimum. ' : ''}{create && !code.trim() ? 'Code d’installation requis.' : ''}</p>}
      {error && <p className="warn">{error}</p>}
      <button className="primary wide" disabled={busy || !ready}>{busy ? '…' : create ? 'Créer mon compte' : 'Connexion'}</button>
    </form>
  )
}
