import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { IconCloud, IconDownload, IconPalette, IconShield, IconSliders } from '../components/icons'
import { db } from '../lib/db'
import { exportBackup, saveSettings } from '../lib/store'
import { getSyncState, subscribeSync } from '../lib/sync'
import type { Mode, Settings, Spot, Theme, WindUnit } from '../lib/types'
import { AccountCard } from './AccountCard'
import { ProfileCard } from './ProfileCard'

type Page = 'profile' | 'appearance' | 'fishing' | 'account' | 'data' | 'about'

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ icon, color, label, hint, onClick }: { icon: ReactNode; color: string; label: string; hint?: string; onClick: () => void }) {
  return (
    <button className="menu-row" onClick={onClick}>
      <span className="mi" style={{ background: color }}>{icon}</span>
      <span className="ml">{label}</span>
      {hint && <span className="muted small mh">{hint}</span>}
      <span className="chev" aria-hidden="true">›</span>
    </button>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="sec">{title}</h3>
      <div className="menu-group">{children}</div>
    </>
  )
}

export function SettingsView({ settings, spots }: { settings: Settings; spots: Spot[] }) {
  const [page, setPage] = useState<Page | null>(null)
  const st = useSyncExternalStore(subscribeSync, getSyncState)
  const [opacity, setOpacity] = useState(settings.tabOpacity)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setOpacity(settings.tabOpacity), [settings.tabOpacity])
  const changeOpacity = (v: number) => {
    setOpacity(v)
    document.documentElement.style.setProperty('--tab-alpha', `${v}%`)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveSettings({ tabOpacity: v }), 400)
  }

  if (page) {
    const titles: Record<Page, string> = { profile: 'Profil', appearance: 'Apparence', fishing: 'Pêche & unités', account: 'Compte & synchronisation', data: 'Données & sauvegarde', about: 'À propos & sécurité' }
    return (
      <section className="subpage">
        <button className="back" onClick={() => setPage(null)}>‹ Réglages</button>
        <h2>{titles[page]}</h2>
        {page === 'profile' && <ProfileCard settings={settings} />}
        {page === 'account' && <AccountCard />}
        {page === 'appearance' && (
          <div className="card">
            <div className="row between">
              <span>Thème</span>
              <Seg<Theme> value={settings.theme} options={[['auto', 'Auto'], ['dark', 'Sombre'], ['light', 'Clair']]} onChange={(theme) => saveSettings({ theme })} />
            </div>
            <div>
              <div className="row between">
                <span>Opacité de la barre d’onglets</span>
                <span className="muted">{opacity} %</span>
              </div>
              <input type="range" min={40} max={100} step={2} value={opacity} onChange={(e) => changeOpacity(Number(e.target.value))} aria-label="Opacité de la barre d’onglets" />
              <div className="row between muted small"><span>Transparente</span><span>Opaque</span></div>
            </div>
          </div>
        )}
        {page === 'fishing' && (
          <div className="card">
            <div className="row between">
              <span>Unité du vent</span>
              <Seg<WindUnit> value={settings.windUnit} options={[['kmh', 'km/h'], ['kt', 'nœuds']]} onChange={(windUnit) => saveSettings({ windUnit })} />
            </div>
            <div className="row between">
              <span>Type de sortie</span>
              <Seg<Mode> value={settings.defaultMode} options={[['bord', 'Bord'], ['plongee', 'Sous-marine']]} onChange={(defaultMode) => saveSettings({ defaultMode })} />
            </div>
            <div className="row between">
              <span>Spot par défaut</span>
              <select value={settings.defaultSpotUid ?? ''} onChange={(e) => saveSettings({ defaultSpotUid: e.target.value || undefined })}>
                <option value="">Premier de la liste</option>
                {spots.map((s) => (
                  <option key={s.uid} value={s.uid}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {page === 'data' && (
          <div className="card">
            <p className="muted small">Une sauvegarde contient tes spots, sorties, photos et réglages dans un fichier à garder.</p>
            <div className="row">
              <button onClick={exportBackup}>Exporter une sauvegarde</button>
              <button onClick={() => confirm('Effacer les prévisions en cache ? Elles seront retéléchargées.') && db.forecasts.clear()}>Vider le cache des prévisions</button>
            </div>
          </div>
        )}
        {page === 'about' && (
          <div className="card">
            <p>Prévisions météo et marines : <strong>Open-Meteo</strong>.</p>
            <p className="muted small">Le coefficient de marée est une estimation calculée à partir de la lune, pas la valeur officielle du SHOM. La visibilité sous l’eau est une estimation.</p>
            <p className="muted small">Tailles minimales et espèces : valeurs indicatives, à vérifier avec la réglementation en vigueur.</p>
            <p className="warn small">Ne te fie jamais uniquement à l’appli pour ta sécurité en mer. En chasse sous-marine : jamais seul, balise de surface obligatoire.</p>
          </div>
        )}
      </section>
    )
  }

  const name = [settings.firstName, settings.lastName].filter(Boolean).join(' ')
  return (
    <section>
      <div className="hero">
        <Avatar settings={settings} size={96} />
        <h2>{name || 'Ton profil'}</h2>
        <p className="muted">{st.loggedIn ? st.email ?? 'Connecté' : 'Non connecté'}</p>
        <button className="pillbtn" onClick={() => setPage('profile')}>✎ Modifier le profil</button>
      </div>

      <Group title="Paramètres">
        <Row icon={<IconPalette />} color="#9b6bc2" label="Apparence" onClick={() => setPage('appearance')} />
        <Row icon={<IconSliders />} color="#d9714f" label="Pêche & unités" hint={settings.windUnit === 'kt' ? 'nœuds' : 'km/h'} onClick={() => setPage('fishing')} />
      </Group>

      <Group title="Compte & données">
        <Row icon={<IconCloud />} color="#2f9bd8" label="Compte" hint={st.loggedIn ? 'Connecté' : 'Non connecté'} onClick={() => setPage('account')} />
        <Row icon={<IconDownload />} color="#3ea56e" label="Données & sauvegarde" onClick={() => setPage('data')} />
      </Group>

      <Group title="Informations">
        <Row icon={<IconShield />} color="#c75b6a" label="À propos & sécurité" onClick={() => setPage('about')} />
      </Group>
    </section>
  )
}
