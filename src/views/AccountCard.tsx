import { useState, useSyncExternalStore } from 'react'
import { createInvite, getSyncState, login, logout, signup, subscribeSync, syncNow } from '../lib/sync'

const params = new URLSearchParams(location.search)

export function AccountCard() {
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [create, setCreate] = useState(params.has('invit'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(params.get('invit') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<{ code: string; link: string; expiresAt: number } | null>(null)
  const [inviteMsg, setInviteMsg] = useState('')

  const fail = (err: unknown) => setError(err instanceof TypeError ? 'Pas de connexion internet.' : err instanceof Error ? err.message : 'Erreur')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (create) await signup(email.trim(), password, code.trim())
      else await login(email.trim(), password)
      setPassword('')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function makeInvite() {
    setInviteMsg('')
    try {
      const r = await createInvite()
      setInvite({ code: r.code, link: `${location.origin}/?invit=${r.code}`, expiresAt: r.expiresAt })
    } catch (err) {
      setInviteMsg(err instanceof TypeError ? 'Pas de connexion internet.' : err instanceof Error ? err.message : 'Erreur')
    }
  }
  async function shareInvite() {
    if (!invite) return
    const text = `Je t’invite sur l’appli de pêche : ${invite.link}`
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
        <div className="invite">
          <strong>Inviter quelqu’un</strong>
          <p className="muted small">Crée un code à usage unique (valable 14 jours). La personne aura son propre compte, avec ses propres données, et te recevra comme demande d’ami.</p>
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
      </div>
    )
  }

  const mailOk = /\S+@\S+\.\S+/.test(email)
  const ready = mailOk && password.length >= 8 && (!create || code.trim().length > 0)
  return (
    <form className="card" onSubmit={submit}>
      <div className="seg full" role="group" aria-label="Mode">
        <button type="button" className={!create ? 'on' : ''} onClick={() => { setCreate(false); setError('') }}>Se connecter</button>
        <button type="button" className={create ? 'on' : ''} onClick={() => { setCreate(true); setError('') }}>Créer un compte</button>
      </div>
      <p className="muted small">{create ? 'Il te faut un code d’invitation, donné par quelqu’un qui a déjà un compte (chaque code ne crée qu’un compte).' : 'Connecte-toi pour sauvegarder tes données en ligne. Sans compte, tout reste sur ce téléphone.'}</p>
      <input type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="off" autoCorrect="off" />
      <input type="password" placeholder={create ? 'Mot de passe (8 caractères min.)' : 'Mot de passe'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} />
      {create && <input placeholder="Code d’invitation" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" />}
      {!ready && (email || password) && <p className="muted small">{!mailOk ? 'Entre une adresse e-mail valide. ' : ''}{password.length < 8 ? 'Mot de passe : 8 caractères minimum. ' : ''}{create && !code.trim() ? 'Code d’invitation requis.' : ''}</p>}
      {error && <p className="warn">{error}</p>}
      <button className="primary wide" disabled={busy || !ready}>{busy ? '…' : create ? 'Créer mon compte' : 'Connexion'}</button>
    </form>
  )
}
