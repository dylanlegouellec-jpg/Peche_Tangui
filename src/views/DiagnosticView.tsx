import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { clearLogs, getLogs, logVersion, subscribeLogs, type Level } from '../lib/diagnostics'
import { getSyncDebug, getSyncState, subscribeSync } from '../lib/sync'

const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : n > 1024 ? `${Math.round(n / 1024)} Ko` : `${n} o`)
const hms = (t: number) => new Date(t).toLocaleTimeString('fr-FR')
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

interface Storage {
  spots: number
  trips: number
  photos: number
  photoBytes: number
  forecasts: number
  usage?: number
  quota?: number
  caches: string[]
}

async function readStorage(): Promise<Storage> {
  const [spots, trips, forecasts, photos] = await Promise.all([db.spots.count(), db.trips.count(), db.forecasts.count(), db.photos.toArray()])
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  const names = (await caches?.keys?.().catch(() => [])) ?? []
  const caches_ = await Promise.all(names.map(async (n) => `${n} (${(await (await caches.open(n)).keys()).length} fichiers)`))
  return { spots, trips, forecasts, photos: photos.length, photoBytes: photos.reduce((s, p) => s + p.blob.size, 0), usage: est?.usage, quota: est?.quota, caches: caches_ }
}

interface Probe {
  name: string
  ms?: number
  detail: string
  ok: boolean
}

async function probe(name: string, url: string, init?: RequestInit): Promise<Probe> {
  const t0 = performance.now()
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    const body = await r.text()
    return { name, ok: r.ok, ms: Math.round(performance.now() - t0), detail: `HTTP ${r.status}${name === 'API (santé)' ? ' · ' + body.slice(0, 120) : ''}` }
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

export function DiagnosticView() {
  const sync = useSyncExternalStore(subscribeSync, getSyncState)
  useSyncExternalStore(subscribeLogs, logVersion)
  const [storage, setStorage] = useState<Storage>()
  const [probes, setProbes] = useState<Probe[]>([])
  const [testing, setTesting] = useState(false)
  const [filter, setFilter] = useState<Level | 'all'>('all')
  const [swState, setSwState] = useState('…')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    readStorage().then(setStorage)
    navigator.serviceWorker?.getRegistration().then((r) => setSwState(r ? `${r.active ? 'actif' : 'inactif'}${r.waiting ? ' · mise à jour en attente' : ''}${navigator.serviceWorker.controller ? ' · contrôle la page' : ''}` : 'aucun'))
  }, [])

  async function runTests() {
    setTesting(true)
    setProbes([])
    const token = localStorage.getItem('peche-token')
    const list = await Promise.all([
      probe('API (santé)', '/api/health'),
      probe('API (synchro)', '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ since: Date.now() }) }),
      probe('Open-Meteo météo', 'https://api.open-meteo.com/v1/forecast?latitude=47.5&longitude=-3.1&hourly=wind_speed_10m&forecast_days=1'),
      probe('Open-Meteo mer', 'https://marine-api.open-meteo.com/v1/marine?latitude=47.5&longitude=-3.1&hourly=wave_height&forecast_days=1'),
    ])
    setProbes(list)
    console.info('Tests réseau : ' + list.map((p) => `${p.name} ${p.ok ? p.ms + ' ms' : 'ÉCHEC'}`).join(' · '))
    setTesting(false)
  }

  async function forceUpdate() {
    if (!confirm('Forcer la mise à jour ? L’appli vide son cache et se recharge (tes données et ton compte sont conservés).')) return
    setMsg('Mise à jour…')
    try {
      for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister()
      for (const k of await caches.keys()) await caches.delete(k)
    } finally {
      location.reload()
    }
  }

  async function checkUpdate() {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (!reg) return setMsg('Pas de service worker (mode navigateur sans installation).')
    setMsg('Recherche…')
    await reg.update()
    setMsg(reg.waiting || reg.installing ? 'Nouvelle version trouvée : rechargement…' : 'Tu as déjà la dernière version.')
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    if (reg.installing || reg.waiting) setTimeout(() => location.reload(), 1500)
  }

  const stats = __CODE_STATS__
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  const dbg = getSyncDebug()
  const logs = getLogs().filter((l) => filter === 'all' || l.level === filter)

  const app: [string, string][] = [
    ['Version', `${__COMMIT__} · construite le ${new Date(__BUILD_TIME__).toLocaleString('fr-FR')}`],
    ['Mode', standalone() ? 'Appli installée (plein écran)' : 'Navigateur (non installée)'],
    ['Service worker', swState],
    ['Adresse', location.origin],
  ]
  const device: [string, string][] = [
    ['Écran', `${screen.width}×${screen.height} · ${devicePixelRatio}x`],
    ['Fenêtre', `${innerWidth}×${innerHeight} · ${innerWidth > innerHeight ? 'paysage' : 'portrait'}`],
    ['Langue / fuseau', `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`],
    ['Réseau', `${navigator.onLine ? 'en ligne' : 'hors ligne'}${conn ? ` · ${conn.effectiveType ?? '?'} · ${conn.downlink ?? '?'} Mb/s` : ''}`],
    ['Mémoire JS', mem ? fmtBytes(mem.usedJSHeapSize) : 'non disponible'],
    ['Navigateur', navigator.userAgent],
  ]
  const syncRows: [string, string][] = [
    ['Compte', sync.loggedIn ? sync.email ?? 'connecté' : 'non connecté'],
    ['État', sync.status + (sync.error ? ` · ${sync.error}` : '')],
    ['Dernière synchro', sync.last ? new Date(sync.last).toLocaleString('fr-FR') : '—'],
    ['Curseur serveur', dbg.cursor ? new Date(dbg.cursor).toLocaleString('fr-FR') : '—'],
  ]

  const report = () =>
    [
      '=== Diagnostic Pêche ===',
      ...app.map(([k, v]) => `${k}: ${v}`),
      `Code: ${stats.lines} lignes, ${stats.files} fichiers (${Object.entries(stats.byType).map(([k, v]) => `${k} ${v}`).join(', ')})`,
      ...device.map(([k, v]) => `${k}: ${v}`),
      ...syncRows.map(([k, v]) => `${k}: ${v}`),
      storage ? `Stockage: ${storage.spots} spots, ${storage.trips} sorties, ${storage.photos} photos (${fmtBytes(storage.photoBytes)}), ${storage.forecasts} prévisions; usage ${fmtBytes(storage.usage ?? 0)} / ${fmtBytes(storage.quota ?? 0)}` : '',
      ...probes.map((p) => `Test ${p.name}: ${p.ok ? 'ok' : 'ÉCHEC'} ${p.ms ?? ''} ms ${p.detail}`),
      '--- Console ---',
      ...getLogs().map((l) => `${hms(l.t)} [${l.level}] ${l.msg}`),
    ].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(report())
      setMsg('Rapport copié : colle-le dans la conversation.')
    } catch {
      setMsg('Copie impossible : sélectionne le texte de la console à la main.')
    }
  }

  const Rows = ({ rows }: { rows: [string, string][] }) => (
    <>
      {rows.map(([k, v]) => (
        <div className="kv" key={k}>
          <span className="muted">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </>
  )

  return (
    <div className="diag">
      <div className="card">
        <h3>Application</h3>
        <Rows rows={app} />
        <div className="row">
          <button onClick={checkUpdate}>Vérifier les mises à jour</button>
          <button onClick={forceUpdate}>Forcer la mise à jour</button>
          <button className="primary" onClick={copy}>Copier le rapport</button>
        </div>
        {msg && <p className="muted small">{msg}</p>}
      </div>

      <div className="card">
        <h3>Code de l’application</h3>
        <div className="big-stat">{stats.lines.toLocaleString('fr-FR')} <span className="muted">lignes · {stats.files} fichiers</span></div>
        <Rows rows={Object.entries(stats.byType).map(([k, v]): [string, string] => [k, `${v.toLocaleString('fr-FR')} lignes`])} />
        <p className="muted small">Plus gros fichiers</p>
        <Rows rows={stats.top.map((f): [string, string] => [f.path.replace(/^src\//, ''), `${f.lines} lignes`])} />
      </div>

      <div className="card">
        <h3>Stockage sur ce téléphone</h3>
        {storage ? (
          <>
            <Rows rows={[
              ['Spots / sorties', `${storage.spots} / ${storage.trips}`],
              ['Photos', `${storage.photos} · ${fmtBytes(storage.photoBytes)}`],
              ['Prévisions en cache', `${storage.forecasts}`],
              ['Espace utilisé', storage.usage != null ? `${fmtBytes(storage.usage)} sur ${fmtBytes(storage.quota ?? 0)}` : 'inconnu'],
              ['Cache de l’appli', storage.caches.join(', ') || 'aucun'],
            ]} />
          </>
        ) : <p className="muted">Lecture…</p>}
      </div>

      <div className="card">
        <h3>Réseau & services</h3>
        <button onClick={runTests} disabled={testing}>{testing ? 'Test en cours…' : 'Lancer les tests'}</button>
        {probes.map((p) => (
          <div className="kv" key={p.name}>
            <span>{p.ok ? '✅' : '❌'} {p.name}</span>
            <span className="muted">{p.ms != null ? `${p.ms} ms · ` : ''}{p.detail}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Synchronisation</h3>
        <Rows rows={syncRows} />
      </div>

      <div className="card">
        <h3>Appareil & performance</h3>
        <Rows rows={device} />
        {nav && <Rows rows={[['Chargement de la page', `${Math.round(nav.domContentLoadedEventEnd)} ms (complet : ${Math.round(nav.loadEventEnd)} ms)`], ['Ressources chargées', `${resources.length} · ${fmtBytes(resources.reduce((s, r) => s + r.transferSize, 0))}`]]} />}
      </div>

      <div className="card">
        <div className="row between">
          <h3>Console</h3>
          <button className="mini" onClick={clearLogs}>Effacer</button>
        </div>
        <div className="seg">
          {(['all', 'error', 'warn', 'info', 'log'] as const).map((l) => (
            <button key={l} className={filter === l ? 'on' : ''} onClick={() => setFilter(l)}>{l === 'all' ? 'Tout' : l}</button>
          ))}
        </div>
        <div className="console" role="log">
          {logs.length === 0 && <span className="muted">Aucun message.</span>}
          {logs.map((l, i) => (
            <div key={i} className={`log ${l.level}`}><span className="muted">{hms(l.t)}</span> {l.msg}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
