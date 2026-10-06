import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, seedSpots } from './lib/db'
import type { Mode, Spot } from './lib/types'
import { JournalView } from './views/JournalView'
import { SpeciesView } from './views/SpeciesView'
import { SpotsView } from './views/SpotsView'
import { TodayView } from './views/TodayView'

type Tab = 'today' | 'species' | 'journal' | 'spots'
const TABS: [Tab, string][] = [
  ['today', '🌊 Aujourd’hui'],
  ['species', '🐟 Espèces'],
  ['journal', '📓 Carnet'],
  ['spots', '📍 Spots'],
]

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* stockage indisponible */
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [spots, setSpots] = useState<Spot[]>([])
  const [spotId, setSpotId] = useState<number | undefined>(Number(stored('spot', '')) || undefined)
  const [mode, setMode] = useState<Mode>(stored<Mode>('mode', 'bord'))

  useEffect(() => {
    seedSpots()
    const sub = liveQuery(() => db.spots.toArray()).subscribe(setSpots)
    return () => sub.unsubscribe()
  }, [])

  return (
    <div className="app">
      <header>
        <h1>Pêche Tangui</h1>
        <span className="muted small">Morbihan</span>
      </header>
      <main>
        {spots.length === 0 && tab !== 'spots' ? (
          <p className="muted">Ajoute un spot pour commencer.</p>
        ) : tab === 'today' ? (
          <TodayView spots={spots} spotId={spotId} setSpotId={(id) => { setSpotId(id); save('spot', String(id)) }} mode={mode} setMode={(m) => { setMode(m); save('mode', m) }} />
        ) : tab === 'species' ? (
          <SpeciesView mode={mode} />
        ) : tab === 'journal' ? (
          <JournalView spots={spots} mode={mode} />
        ) : (
          <SpotsView spots={spots} />
        )}
      </main>
      <nav>
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
