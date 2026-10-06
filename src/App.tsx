import { liveQuery } from 'dexie'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from './components/Avatar'
import { TabBar, type Tab } from './components/TabBar'
import { loadSettings, seedSpots } from './lib/db'
import { liveSpots } from './lib/store'
import { startAutoSync } from './lib/sync'
import { DEFAULT_SETTINGS, type Mode, type Settings, type Spot } from './lib/types'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SpeciesView } from './views/SpeciesView'
import { SpotsView } from './views/SpotsView'
import { TodayView } from './views/TodayView'

const ORDER: Tab[] = ['today', 'species', 'journal', 'spots', 'settings']

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const scrollRef = useRef<HTMLElement>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [spotId, setSpotId] = useState<number>()
  const [mode, setMode] = useState<Mode>()

  useEffect(() => {
    seedSpots().then(startAutoSync)
    const a = liveQuery(liveSpots).subscribe(setSpots)
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
  useEffect(() => {
    document.documentElement.style.setProperty('--tab-alpha', `${settings.tabOpacity}%`)
  }, [settings.tabOpacity])

  const changeTab = (t: Tab) => {
    if (t === tab) return
    setDir(ORDER.indexOf(t) > ORDER.indexOf(tab) ? 'fwd' : 'back')
    setTab(t)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const currentMode = mode ?? settings.defaultMode
  const currentSpot = spotId ?? spots.find((s) => s.uid === settings.defaultSpotUid)?.id

  return (
    <div className="shell">
      <header>
        <h1>Pêche</h1>
        <span className="muted small">Morbihan</span>
        <button className="avatar-btn" onClick={() => changeTab('settings')} aria-label="Profil et réglages">
          <Avatar settings={settings} size={32} />
        </button>
      </header>
      <main className="scroll" ref={scrollRef}>
        <div className="app">
          <div className={`page ${dir}`} key={tab}>
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
          </div>
        </div>
      </main>
      <TabBar tab={tab} onChange={changeTab} />
    </div>
  )
}
