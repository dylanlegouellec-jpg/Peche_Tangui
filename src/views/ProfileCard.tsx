import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { shrinkAvatar } from '../lib/photo'
import { saveSettings, setAvatar } from '../lib/store'
import type { Settings } from '../lib/types'

export function ProfileCard({ settings }: { settings: Settings }) {
  const [first, setFirst] = useState(settings.firstName ?? '')
  const [last, setLast] = useState(settings.lastName ?? '')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Un autre appareil a changé le nom : on recopie, sans écraser une saisie en cours.
  useEffect(() => {
    setFirst(settings.firstName ?? '')
    setLast(settings.lastName ?? '')
  }, [settings.firstName, settings.lastName])

  const save = (firstName: string, lastName: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveSettings({ firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined }), 500)
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await setAvatar(await shrinkAvatar(file))
    } finally {
      setBusy(false)
    }
  }

  const name = [settings.firstName, settings.lastName].filter(Boolean).join(' ')
  return (
    <div className="card profile">
      <label className="avatar-pick" aria-label="Changer la photo de profil">
        <Avatar settings={settings} size={72} />
        <span className="avatar-badge">{busy ? '…' : '📷'}</span>
        <input type="file" accept="image/*" hidden onChange={pick} />
      </label>
      <div className="profile-fields">
        <strong>{name || 'Ton profil'}</strong>
        <input placeholder="Prénom" value={first} autoComplete="given-name" onChange={(e) => { setFirst(e.target.value); save(e.target.value, last) }} />
        <input placeholder="Nom" value={last} autoComplete="family-name" onChange={(e) => { setLast(e.target.value); save(first, e.target.value) }} />
      </div>
    </div>
  )
}
