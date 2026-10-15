import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from './components/Avatar'
import { TabBar, type Tab } from './components/TabBar'
import { Backdrop } from './components/fx/Backdrop'
import { Celebrations } from './components/fx/Celebrate'
import { Lightbox } from './components/fx/Lightbox'
import { PullRefresh } from './components/fx/PullRefresh'
import { Splash } from './components/fx/Splash'
import { TouchFx } from './components/fx/TouchFx'
import { CHANGELOG } from './data/changelog'
import { LookContext, useReducedMotion, useSystemDark, type LookState } from './lib/look'
import { loadSettings, seedSpots } from './lib/db'
import { liveSpots } from './lib/store'
import { getSyncState, startAutoSync, subscribeSync } from './lib/sync'
import { listFriends } from './lib/friends'
import { DEFAULT_FX, DEFAULT_SETTINGS, type Mode, type Settings, type Spot } from './lib/types'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SpeciesView } from './views/SpeciesView'
import { SpotsView } from './views/SpotsView'
import { TodayView } from './views/TodayView'

const ORDER: Tab[] = ['today', 'species', 'journal', 'spots', 'settings']

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [toast, setToast] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem('peche-updated')) {
        sessionStorage.removeItem('peche-updated')
        return `Nouvelle version : ${CHANGELOG[0]?.title ?? __COMMIT__} · détails dans Réglages → Diagnostic`
      }
    } catch {
      /* stockage indisponible */
    }
    return null
  })
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const scrollRef = useRef<HTMLElement>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [spotId, setSpotId] = useState<number>()
  const [mode, setMode] = useState<Mode>()
  // Demandes d'amis en attente : pastille sur l'onglet Carnet (vérifié au lancement, au retour sur l'appli et toutes les 10 min)
  const [requests, setRequests] = useState(0)
  useEffect(() => {
    const check = () => (getSyncState().loggedIn && navigator.onLine ? listFriends().then((l) => setRequests(l.incoming.length), () => undefined) : setRequests(0))
    check()
    const unsub = subscribeSync(() => !getSyncState().loggedIn && setRequests(0))
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const t = setInterval(check, 10 * 60 * 1000)
    return () => {
      unsub()
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(t)
    }
  }, [])

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

  // Style visuel et niveau d'animation (le réglage « Réduire les animations » du téléphone coupe tout)
  const reduce = useReducedMotion()
  const systemDark = useSystemDark()
  const look: LookState = useMemo(
    () => ({
      look: settings.look ?? 'ocean',
      motion: reduce ? 'off' : (settings.motion ?? 'full'),
      fx: { ...DEFAULT_FX, ...settings.fx },
      dark: settings.theme === 'dark' || (settings.theme === 'auto' && systemDark),
    }),
    [settings.look, settings.motion, settings.fx, settings.theme, reduce, systemDark],
  )
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-look', look.look)
    root.setAttribute('data-motion', look.motion)
  }, [look.look, look.motion])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const changeTab = (t: Tab) => {
    if (t === tab) return
    setDir(ORDER.indexOf(t) > ORDER.indexOf(tab) ? 'fwd' : 'back')
    setTab(t)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const currentMode = mode ?? settings.defaultMode
  // Les marqueurs personnels (coin à homard…) n'ont pas de prévisions : ils restent sur la carte.
  const places = spots.filter((s) => !s.pin)
  const currentSpot = spotId ?? places.find((s) => s.uid === settings.defaultSpotUid)?.id

  return (
    <LookContext.Provider value={look}>
    <Backdrop />
    <div className="shell">
      <header>
        <h1>Pêche</h1>
        <span className="muted small">Morbihan</span>
        <button className="avatar-btn" onClick={() => changeTab('settings')} aria-label="Profil et réglages">
          <Avatar settings={settings} size={32} dot />
        </button>
      </header>
      <main className="scroll" ref={scrollRef}>
        <PullRefresh scroller={scrollRef} enabled={tab === 'today'} onRefresh={() => window.dispatchEvent(new Event('peche-refresh'))} />
        <div className="app">
          <div className={`page page-${dir}`} key={tab}>
        {tab === 'settings' ? (
          <SettingsView settings={settings} spots={places} />
        ) : tab === 'spots' ? (
          <SpotsView spots={spots} onOpenSpot={(id) => { setSpotId(id); changeTab('today') }} />
        ) : places.length === 0 ? (
          <p className="muted">Ajoute un spot pour commencer.</p>
        ) : tab === 'today' ? (
          <TodayView spots={places} spotId={currentSpot} setSpotId={setSpotId} mode={currentMode} setMode={setMode} windUnit={settings.windUnit} forecastDays={settings.forecastDays} showRanking={!!settings.showRanking} />
        ) : tab === 'species' ? (
          <SpeciesView mode={currentMode} />
        ) : (
          <JournalView spots={places} mode={currentMode} settings={settings} onRequests={setRequests} />
        )}
          </div>
        </div>
      </main>
      <TabBar tab={tab} onChange={changeTab} badges={{ journal: requests }} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
    <Splash />
    <TouchFx />
    <Celebrations />
    <Lightbox />
    </LookContext.Provider>
  )
}
