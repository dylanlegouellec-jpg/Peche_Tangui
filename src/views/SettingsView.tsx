import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { IconCloud, IconDownload, IconMonitor, IconMoon, IconPalette, IconShield, IconSliders, IconSun, IconTerminal } from '../components/icons'
import { db } from '../lib/db'
import { exportBackup, saveSettings } from '../lib/store'
import { TIDE_SOURCE } from '../lib/tides'
import { getSyncState, subscribeSync } from '../lib/sync'
import type { Mode, Settings, Spot, Theme, WindUnit } from '../lib/types'
import { AccountCard } from './AccountCard'
import { DiagnosticView } from './DiagnosticView'
import { ProfileCard } from './ProfileCard'

type Page = 'profile' | 'appearance' | 'fishing' | 'account' | 'data' | 'about' | 'diagnostic'

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
    const titles: Record<Page, string> = { profile: 'Profil', appearance: 'Apparence', fishing: 'Pêche & unités', account: 'Compte & synchronisation', data: 'Données & sauvegarde', about: 'À propos & sécurité', diagnostic: 'Diagnostic' }
    return (
      <section className="subpage">
        <button className="back" onClick={() => setPage(null)}>‹ Réglages</button>
        <h2>{titles[page]}</h2>
        {page === 'profile' && <ProfileCard settings={settings} />}
        {page === 'account' && <AccountCard />}
        {page === 'appearance' && (
          <div className="card">
            <div>
              <strong>Thème</strong>
              <p className="muted small">Clair, sombre ou selon ton téléphone. Retenu sur ton compte : le même sur tous tes appareils.</p>
              <div className="seg icons" role="group" aria-label="Thème">
                {([['light', 'Clair', <IconSun />], ['dark', 'Sombre', <IconMoon />], ['auto', 'Selon le téléphone', <IconMonitor />]] as [Theme, string, ReactNode][]).map(([v, label, icon]) => (
                  <button key={v} className={settings.theme === v ? 'on' : ''} onClick={() => saveSettings({ theme: v })} aria-label={label} aria-pressed={settings.theme === v} title={label}>
                    {icon}
                  </button>
                ))}
              </div>
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
            <div>
              <div className="row between">
                <span>Jours de prévisions</span>
                <span className="muted">{settings.forecastDays} jours</span>
              </div>
              <div className="seg full" role="group" aria-label="Jours de prévisions">
                {[3, 5, 8, 12, 16].map((n) => (
                  <button key={n} className={settings.forecastDays === n ? 'on' : ''} onClick={() => saveSettings({ forecastDays: n })}>{n}</button>
                ))}
              </div>
              <p className="muted small">Plus on regarde loin, plus c’est incertain. Au-delà de 8 jours, la houle et les marées ne sont plus prévues. Les jours au-delà de ton choix restent accessibles par le calendrier.</p>
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
        {page === 'diagnostic' && <DiagnosticView />}
        {page === 'about' && (
          <div className="card">
            <p>Prévisions météo et marines : <strong>Open-Meteo</strong>.</p>
            <p className="muted small">Marées et coefficient sont <strong>calculés dans l’appli</strong> (marée astronomique, gratuit, hors ligne, valable pour n’importe quelle date) à partir des constantes harmoniques des jauges de marée REFMAR. Ils ne tiennent pas compte de la météo (une dépression ou un vent fort peut décaler la marée réelle). Le coefficient est calculé d’après Brest, à 2-3 points près de la valeur officielle du SHOM. La visibilité sous l’eau est une estimation.</p>
            <p className="muted small">{TIDE_SOURCE}</p>
            <p className="muted small">
              Niveaux d’eau mesurés : marégraphes REFMAR du SHOM (Licence Ouverte Etalab). Relief marin et profondeurs : EMODnet Bathymetry (profondeurs rapportées au zéro des cartes, indicatives). Webcams : Windy.com. Chlorophylle de surface : satellite VIIRS, NOAA CoastWatch. Courants, houle et transparence : Copernicus Marine, modèle IBI (E.U. Copernicus Marine Service, maille d’environ 3 km, données ouvertes) ; à défaut, Open-Meteo. Même à 3 km, les courants de marée très localisés restent sous-estimés. Fonds de carte : © contributeurs OpenStreetMap et OpenSeaMap. Météo et mer : Open-Meteo.
            </p>
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
        <Row icon={<IconSliders />} color="#d9714f" label="Pêche & unités" hint={`${settings.forecastDays} j`} onClick={() => setPage('fishing')} />
      </Group>

      <Group title="Compte & données">
        <Row icon={<IconCloud />} color="#2f9bd8" label="Compte" hint={st.loggedIn ? 'Connecté' : 'Non connecté'} onClick={() => setPage('account')} />
        <Row icon={<IconDownload />} color="#3ea56e" label="Données & sauvegarde" onClick={() => setPage('data')} />
      </Group>

      <Group title="Informations">
        <Row icon={<IconShield />} color="#c75b6a" label="À propos & sécurité" onClick={() => setPage('about')} />
        <Row icon={<IconTerminal />} color="#6a7f93" label="Diagnostic" hint={`v ${__COMMIT__}`} onClick={() => setPage('diagnostic')} />
      </Group>
    </section>
  )
}
