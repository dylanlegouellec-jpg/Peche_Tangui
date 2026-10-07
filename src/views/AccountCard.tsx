import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSyncState, login, logout, startSignup, subscribeSync, syncNow, verifySignup } from '../lib/sync'

const params = new URLSearchParams(location.search)

export function AccountCard() {
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [create, setCreate] = useState(params.has('creer'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Délai avant de pouvoir redemander un code
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const fail = (err: unknown) => setError(err instanceof TypeError ? 'Pas de connexion internet.' : err instanceof Error ? err.message : 'Erreur')

  async function send() {
    setBusy(true)
    setError('')
    try {
      await startSignup(email.trim(), password)
      setSent(true)
      setCode('')
      setWait(60)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (create && !sent) return send()
    setBusy(true)
    setError('')
    try {
      if (create) await verifySignup(email.trim().toLowerCase(), code.trim())
      else await login(email.trim(), password)
      setPassword('')
      setSent(false)
    } catch (err) {
      fail(err)
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
      </div>
    )
  }

  const mailOk = /\S+@\S+\.\S+/.test(email)
  const ready = create ? (sent ? code.trim().length === 6 : mailOk && password.length >= 8) : mailOk && password.length >= 8
  return (
    <form className="card" onSubmit={submit}>
      <div className="seg full" role="group" aria-label="Mode">
        <button type="button" className={!create ? 'on' : ''} onClick={() => { setCreate(false); setSent(false); setError('') }}>Se connecter</button>
        <button type="button" className={create ? 'on' : ''} onClick={() => { setCreate(true); setError('') }}>Créer un compte</button>
      </div>
      <p className="muted small">
        {create ? (sent ? `Un code à 6 chiffres vient d’être envoyé à ${email.trim()}. Pense à regarder dans les courriers indésirables.` : 'Tu recevras un code à 6 chiffres par e-mail pour vérifier ton adresse.') : 'Connecte-toi pour sauvegarder tes données en ligne. Sans compte, tout reste sur ce téléphone.'}
      </p>
      <input type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false) }} autoComplete="email" autoCapitalize="off" autoCorrect="off" />
      <input type="password" placeholder={create ? 'Mot de passe (8 caractères min.)' : 'Mot de passe'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} />
      {create && sent && <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Code reçu par e-mail" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
      {!ready && (email || password) && !sent && <p className="muted small">{!mailOk ? 'Entre une adresse e-mail valide. ' : ''}{password.length < 8 ? 'Mot de passe : 8 caractères minimum.' : ''}</p>}
      {error && <p className="warn">{error}</p>}
      <button className="primary wide" disabled={busy || !ready}>{busy ? '…' : create ? (sent ? 'Valider et créer mon compte' : 'Recevoir le code') : 'Connexion'}</button>
      {create && sent && (
        <button type="button" className="wide" disabled={busy || wait > 0} onClick={send}>{wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}</button>
      )}
    </form>
  )
}
