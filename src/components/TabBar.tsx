import type { ReactNode } from 'react'

export type Tab = 'today' | 'species' | 'journal' | 'spots' | 'settings'

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Aujourd’hui', icon: svg(<><path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0" /><path d="M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0" /></>) },
  { id: 'species', label: 'Espèces', icon: svg(<><path d="M3 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2z" /><circle cx="8" cy="11.5" r=".6" fill="currentColor" /></>) },
  { id: 'journal', label: 'Carnet', icon: svg(<><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M9 8h6M9 12h6" /></>) },
  { id: 'spots', label: 'Spots', icon: svg(<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>) },
  { id: 'settings', label: 'Réglages', icon: svg(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>) },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const index = TABS.findIndex((t) => t.id === tab)
  return (
    <nav className="tabbar" aria-label="Navigation" style={{ ['--n' as string]: TABS.length, ['--i' as string]: index }}>
      <div className="pill" aria-hidden="true" />
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => onChange(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
