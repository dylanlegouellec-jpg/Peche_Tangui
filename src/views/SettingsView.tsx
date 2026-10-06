import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { saveSettings } from '../lib/store'
import { AccountCard } from './AccountCard'
import { ProfileCard } from './ProfileCard'
import type { Mode, Settings, Spot, Theme, WindUnit } from '../lib/types'

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

export function SettingsView({ settings, spots }: { settings: Settings; spots: Spot[] }) {
  const [opacity, setOpacity] = useState(settings.tabOpacity)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setOpacity(settings.tabOpacity), [settings.tabOpacity])
  const changeOpacity = (v: number) => {
    setOpacity(v)
    document.documentElement.style.setProperty('--tab-alpha', `${v}%`)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveSettings({ tabOpacity: v }), 400)
  }
  return (
    <section>
      <ProfileCard settings={settings} />
      <AccountCard />
      <div className="card">
        <h3>Affichage</h3>
        <div className="row between">
          <span>Thème</span>
          <Seg<Theme> value={settings.theme} options={[['auto', 'Auto'], ['dark', 'Sombre'], ['light', 'Clair']]} onChange={(theme) => saveSettings({ theme })} />
        </div>
        <div>
          <div className="row between">
            <span>Opacité de la barre d’onglets</span>
            <span className="muted">{opacity} %</span>
          </div>
          <input type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => changeOpacity(Number(e.target.value))} aria-label="Opacité de la barre d’onglets" />
        </div>
        <div className="row between">
          <span>Unité du vent</span>
          <Seg<WindUnit> value={settings.windUnit} options={[['kmh', 'km/h'], ['kt', 'nœuds']]} onChange={(windUnit) => saveSettings({ windUnit })} />
        </div>
      </div>

      <div className="card">
        <h3>Par défaut</h3>
        <div className="row between">
          <span>Type de sortie</span>
          <Seg<Mode> value={settings.defaultMode} options={[['bord', 'Bord'], ['plongee', 'Sous-marine']]} onChange={(defaultMode) => saveSettings({ defaultMode })} />
        </div>
        <div className="row between">
          <span>Spot</span>
          <select value={settings.defaultSpotUid ?? ''} onChange={(e) => saveSettings({ defaultSpotUid: e.target.value || undefined })}>
            <option value="">Premier de la liste</option>
            {spots.map((s) => (
              <option key={s.uid} value={s.uid}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Données</h3>
        <div className="row">
          <button onClick={() => confirm('Effacer les prévisions en cache ? Elles seront retéléchargées.') && db.forecasts.clear()}>Vider le cache des prévisions</button>
        </div>
        <p className="muted small">Prévisions : Open-Meteo. Le coefficient de marée est une estimation, pas la valeur officielle du SHOM. Ne te fie jamais uniquement à l’appli pour ta sécurité en mer.</p>
      </div>
    </section>
  )
}
