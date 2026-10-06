import { useState, useSyncExternalStore } from 'react'
import { authenticate, getSyncState, logout, subscribeSync, syncNow } from '../lib/sync'

export function AccountCard() {
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [first, setFirst] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await authenticate(first ? 'setup' : 'login', password, code)
      setPassword('')
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (st.loggedIn) {
    const label = st.status === 'syncing' ? 'Synchronisation…' : st.status === 'offline' ? 'Hors ligne : synchro dès le retour du réseau' : st.status === 'error' ? `Échec : ${st.error}` : st.last ? `Synchronisé à ${new Date(st.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Pas encore synchronisé'
    return (
      <div className="card">
        <h3>Compte</h3>
        <p className={st.status === 'error' ? 'warn' : 'muted'}>{label}</p>
        <div className="row">
          <button onClick={() => syncNow()} disabled={st.status === 'syncing'}>Synchroniser maintenant</button>
          <button onClick={() => confirm('Se déconnecter ? Les données restent sur ce téléphone mais ne seront plus sauvegardées en ligne.') && logout()}>Déconnexion</button>
        </div>
        <p className="muted small">Spots, sorties, photos et réglages sont sauvegardés en ligne et synchronisés entre tes appareils.</p>
      </div>
    )
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{first ? 'Première connexion' : 'Se connecter'}</h3>
      <p className="muted small">Connecte-toi pour sauvegarder tes données en ligne. Sans compte, tout reste uniquement sur ce téléphone.</p>
      {first && <input placeholder="Code d’installation" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" />}
      <input type="password" placeholder={first ? 'Choisis un mot de passe (8 caractères min.)' : 'Mot de passe'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={first ? 'new-password' : 'current-password'} />
      {error && <p className="warn small">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || password.length < 8}>{busy ? '…' : first ? 'Créer le compte' : 'Connexion'}</button>
        <button type="button" onClick={() => { setFirst(!first); setError('') }}>{first ? 'J’ai déjà un compte' : 'Première fois ?'}</button>
      </div>
    </form>
  )
}
