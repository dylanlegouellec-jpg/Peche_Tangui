import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { buildReport, shareOrDownload } from '../lib/pdf'
import { computeInsights, MIN_TRIPS } from '../lib/insights'
import { computeStats, yearsOf, type Filters } from '../lib/stats'
import { liveTrips } from '../lib/store'
import type { Mode, Settings, Spot, Trip } from '../lib/types'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function StatsView({ settings, defaultMode, spots, onBack }: { settings: Settings; defaultMode: Mode; spots: Spot[]; onBack: () => void }) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [filters, setFilters] = useState<Filters>({ year: new Date().getFullYear(), mode: 'all' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const sub = liveQuery(liveTrips).subscribe(setTrips)
    return () => sub.unsubscribe()
  }, [])

  const years = useMemo(() => yearsOf(trips), [trips])
  // Si l'année choisie n'a aucune sortie (début de saison), on retombe sur « Toutes ».
  const year = filters.year === 'all' || years.includes(filters.year) ? filters.year : years[0] ?? 'all'
  const stats = useMemo(() => computeStats(trips, { ...filters, year }), [trips, filters, year])
  const learned = useMemo(() => computeInsights(trips, spots), [trips, spots])
  const max = stats.species[0]?.count ?? 1
  const maxMonth = Math.max(...stats.months, 1)
  void defaultMode

  async function pdf() {
    setBusy(true)
    setMsg('')
    try {
      const name = [settings.firstName, settings.lastName].filter(Boolean).join(' ')
      const period = year === 'all' ? 'Toutes les sorties' : `Saison ${year}`
      const blob = await buildReport(stats, { title: 'Bilan de pêche', subtitle: `${period}${filters.mode === 'all' ? '' : filters.mode === 'bord' ? ' · bord de mer' : ' · sous-marine'}`, author: name || undefined })
      const r = await shareOrDownload(blob, `bilan-peche-${year}.pdf`)
      setMsg(r === 'downloaded' ? 'PDF téléchargé.' : r === 'shared' ? 'PDF partagé.' : '')
    } catch (e) {
      console.error('PDF', e)
      setMsg('Impossible de créer le PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="subpage">
      <button className="back" onClick={onBack}>‹ Carnet</button>
      <h2>Bilan de saison</h2>

      <div className="row">
        <select value={String(year)} onChange={(e) => setFilters({ ...filters, year: e.target.value === 'all' ? 'all' : Number(e.target.value) })} aria-label="Année">
          {years.length === 0 && <option value="all">—</option>}
          {years.map((y) => <option key={y} value={y}>Saison {y}</option>)}
          {years.length > 0 && <option value="all">Toutes les sorties</option>}
        </select>
      </div>
      <div className="seg full" role="group" aria-label="Type de sortie">
        {([['all', 'Tout'], ['bord', 'Bord de mer'], ['plongee', 'Sous-marine']] as const).map(([v, l]) => (
          <button key={v} className={filters.mode === v ? 'on' : ''} onClick={() => setFilters({ ...filters, mode: v })}>{l}</button>
        ))}
      </div>

      {stats.trips === 0 ? (
        <p className="muted">Aucune sortie pour cette sélection. Enregistre tes sorties dans le carnet : le bilan se construit tout seul.</p>
      ) : (
        <>
          <div className="card weather">
            <div className="tiles">
              <div className="tile"><strong>{stats.trips}</strong><span className="muted small">sorties</span></div>
              <div className="tile"><strong>{stats.catches}</strong><span className="muted small">prises</span></div>
              <div className="tile"><strong>{Math.round(((stats.trips - stats.blank) / stats.trips) * 100)} %</strong><span className="muted small">réussies</span></div>
              <div className="tile"><strong>{stats.weight ? stats.weight.toFixed(1) : '—'}</strong><span className="muted small">kg</span></div>
            </div>
            {stats.biggest && <p className="muted small">Plus belle prise : <strong>{stats.biggest.species} · {stats.biggest.size} cm</strong> ({stats.biggest.spot})</p>}
          </div>

          {stats.species.length > 0 && (
            <div className="card">
              <h3>Par espèce</h3>
              {stats.species.slice(0, 10).map((s) => (
                <div className="hbar" key={s.name}>
                  <span>{s.name}</span>
                  <div className="bar"><i className="good" style={{ width: `${(s.count / max) * 100}%` }} /></div>
                  <span className="muted small">{s.count}{s.maxSize ? ` · max ${s.maxSize} cm` : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3>Par mois</h3>
            <div className="mbars">
              {stats.months.map((n, i) => (
                <div key={i} className="mcol">
                  <span className="small">{n || ''}</span>
                  <i style={{ height: `${Math.max(4, (n / maxMonth) * 70)}px`, opacity: n ? 1 : 0.25 }} />
                  <span className="muted small">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Par spot</h3>
            {stats.spots.map((s) => (
              <div className="win" key={s.name}><span>{s.name}</span><span className="muted">{s.trips} sortie{s.trips > 1 ? 's' : ''} · {s.catches} prise{s.catches > 1 ? 's' : ''}</span></div>
            ))}
          </div>

          <div className="card">
            <h3>Ce que ton journal t’apprend</h3>
            {learned.insights.length ? (
              <>
                {learned.insights.map((i) => (
                  <p key={i.text} className={i.kind === 'good' ? '' : 'warn'}>{i.kind === 'good' ? '✅' : '⚠️'} {i.text}</p>
                ))}
                <p className="muted small">Calculé sur tes {learned.total} sorties, toutes années et tous types confondus. Plus tu en notes, plus c’est fiable ; avec peu de sorties, ce sont des tendances, pas des certitudes.</p>
              </>
            ) : learned.total < MIN_TRIPS ? (
              <p className="muted small">Encore {MIN_TRIPS - learned.total} sortie{MIN_TRIPS - learned.total > 1 ? 's' : ''} dans le journal (même bredouilles) pour que l’appli repère ce qui marche chez toi : marée, heure, vent, coefficient, lune.</p>
            ) : (
              <p className="muted small">Pas encore de tendance nette dans tes {learned.total} sorties.</p>
            )}
          </div>

          {stats.avg.seaTemp != null && (
            <div className="card">
              <h3>Quand ça mord chez toi</h3>
              <p className="muted small">Conditions moyennes de tes sorties réussies :</p>
              <p>
                {stats.avg.airTemp != null && <>Air {stats.avg.airTemp.toFixed(0)} °C · </>}
                Eau {stats.avg.seaTemp.toFixed(1)} °C
                {stats.avg.wind != null && <> · Vent {stats.avg.wind.toFixed(0)} km/h</>}
                {stats.avg.wave != null && <> · Houle {stats.avg.wave.toFixed(1)} m</>}
                {stats.avg.pressure != null && <> · {stats.avg.pressure.toFixed(0)} hPa</>}
              </p>
            </div>
          )}

          <button className="primary wide" onClick={pdf} disabled={busy}>{busy ? 'Création du PDF…' : '📄 Télécharger / partager le PDF'}</button>
          {msg && <p className="muted small">{msg}</p>}
        </>
      )}
    </section>
  )
}
