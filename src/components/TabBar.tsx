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
  { id: 'settings', label: 'Réglages', icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>) },
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
