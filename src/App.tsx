import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { db, loadSettings, seedSpots } from './lib/db'
import { DEFAULT_SETTINGS, type Mode, type Settings, type Spot } from './lib/types'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SpeciesView } from './views/SpeciesView'
import { SpotsView } from './views/SpotsView'
import { TodayView } from './views/TodayView'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [spots, setSpots] = useState<Spot[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [spotId, setSpotId] = useState<number>()
  const [mode, setMode] = useState<Mode>()

  useEffect(() => {
    seedSpots()
    const a = liveQuery(() => db.spots.toArray()).subscribe(setSpots)
    const b = liveQuery(loadSettings).subscribe(setSettings)
    return () => {
      a.unsubscribe()
      b.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  const currentMode = mode ?? settings.defaultMode
  const currentSpot = spotId ?? settings.defaultSpotId

  return (
    <div className="app">
      <header>
        <h1>Pêche Tangui</h1>
        <span className="muted small">Morbihan</span>
      </header>
      <main>
        {tab === 'settings' ? (
          <SettingsView settings={settings} spots={spots} />
        ) : tab === 'spots' ? (
          <SpotsView spots={spots} />
        ) : spots.length === 0 ? (
          <p className="muted">Ajoute un spot pour commencer.</p>
        ) : tab === 'today' ? (
          <TodayView spots={spots} spotId={currentSpot} setSpotId={setSpotId} mode={currentMode} setMode={setMode} windUnit={settings.windUnit} />
        ) : tab === 'species' ? (
          <SpeciesView mode={currentMode} />
        ) : (
          <JournalView spots={spots} mode={currentMode} />
        )}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
