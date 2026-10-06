import { db, saveSettings } from '../lib/db'
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
  return (
    <section>
      <div className="card">
        <h3>Affichage</h3>
        <div className="row between">
          <span>Thème</span>
          <Seg<Theme> value={settings.theme} options={[['auto', 'Auto'], ['dark', 'Sombre'], ['light', 'Clair']]} onChange={(theme) => saveSettings({ theme })} />
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
          <select value={settings.defaultSpotId ?? ''} onChange={(e) => saveSettings({ defaultSpotId: Number(e.target.value) || undefined })}>
            <option value="">Premier de la liste</option>
            {spots.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
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
