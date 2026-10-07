import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar } from '../components/Calendar'
import { LiveTide } from '../components/LiveTide'
import { WebcamsCard } from '../components/WebcamsCard'
import { depthAt, type Depth } from '../lib/bathy'
import { fetchChlorophyll, waterLook, type Chlorophyll } from '../lib/chloro'
import { fetchCmems, mergeCmems, type Cmems } from '../lib/cmems'
import { fetchVigilance, type VigilanceDay } from '../lib/vigilance'
import { compass, swellFactor, windKind, WIND_LABEL } from '../lib/exposure'
import { BestSpots } from '../components/BestSpots'
import { PlanCard } from '../components/PlanCard'
import { FRESH_MS, findTides, loadForecast, peekForecast, type Loaded } from '../lib/forecast'
import { moonLabel } from '../lib/moon'
import { coefficientAt, nearestStation, predictTides } from '../lib/tides'
import { noonOf } from '../lib/astro'
import { bestWindows, dayKey, dayLabel, fmtWind, scoreSeries } from '../lib/scoring'
import type { Mode, Spot, WindUnit } from '../lib/types'

const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const dayShort = (ts: number) => new Date(ts * 1000).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })
const tone = (s: number) => (s >= 70 ? 'good' : s >= 45 ? 'mid' : 'bad')

interface Props {
  spots: Spot[]
  spotId: number | undefined
  setSpotId: (id: number) => void
  mode: Mode
  setMode: (m: Mode) => void
  windUnit: WindUnit
  forecastDays: number
  showRanking: boolean
}

export function TodayView({ spots, spotId, setSpotId, mode, setMode, windUnit, forecastDays, showRanking }: Props) {
  const spot = spots.find((s) => s.id === spotId) ?? spots[0]
  const [rawData, setData] = useState<Loaded | null | undefined>(() => peekForecast(spot?.id))
  const [cm, setCm] = useState<Cmems | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [calendar, setCalendar] = useState(false)
  const [depth, setDepth] = useState<Depth | null>(null)
  const [chl, setChl] = useState<Chlorophyll | null>(null)
  const [vigilance, setVigilance] = useState<VigilanceDay[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pressed = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const sparkRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef(rawData)
  dataRef.current = rawData
  // Courant et houle de Copernicus (plus fins près de la côte) par-dessus Open-Meteo, dès qu'ils sont chargés
  const data = useMemo(() => (rawData ? { ...rawData, forecast: mergeCmems(rawData.forecast, cm) } : rawData), [rawData, cm])

  // `force` = true : on ignore le cache de 15 min (bouton ↻, retour sur l'appli après un long moment, toutes les 30 min).
  const refresh = useCallback(
    async (force: boolean) => {
      if (!spot) return
      setRefreshing(true)
      const d = await loadForecast(spot, force)
      setData((prev) => d ?? prev ?? null)
      setRefreshing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spot?.id, spot?.lat, spot?.lon],
  )

  useEffect(() => {
    setData(peekForecast(spot?.id))
    refresh(false)
  }, [refresh, spot?.id])

  useEffect(() => {
    const stale = () => {
      const f = dataRef.current?.forecast
      return !f || Date.now() - f.fetchedAt > 2 * FRESH_MS
    }
    const onVisible = () => document.visibilityState === 'visible' && stale() && refresh(true)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => refresh(true), 30 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    setDepth(null)
    if (!spot) return
    let cancelled = false
    depthAt(spot.lat, spot.lon).then((d) => !cancelled && setDepth(d))
    return () => {
      cancelled = true
    }
  }, [spot?.lat, spot?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCm(null)
    if (!spot) return
    let cancelled = false
    fetchCmems(spot.lat, spot.lon).then((c) => !cancelled && setCm(c))
    return () => {
      cancelled = true
    }
  }, [spot?.lat, spot?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setChl(null)
    if (!spot) return
    let cancelled = false
    fetchChlorophyll(spot.lat, spot.lon).then((c) => !cancelled && setChl(c))
    return () => {
      cancelled = true
    }
  }, [spot?.lat, spot?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchVigilance().then(setVigilance)
  }, [])

  const now = Math.floor(Date.now() / 1000)
  const stationInfo = useMemo(() => (spot ? nearestStation(spot.lat, spot.lon) : null), [spot])
  // Marées calculées d'après la jauge la plus proche (gratuit, hors ligne, valable à 16 jours) ; repli sur le modèle Open-Meteo si aucune jauge n'est proche.
  const tides = useMemo(() => {
    if (!data) return []
    const hours = data.forecast.hours
    if (stationInfo && stationInfo.distance < 120) return predictTides(stationInfo.station, hours[0].ts - 43200, hours[hours.length - 1].ts + 43200)
    return findTides(hours)
  }, [data, stationInfo])
  const all = useMemo(() => (data ? scoreSeries(data.forecast, tides, mode, 0, windUnit, { facing: spot?.facing, chl: chl ? { value: chl.value, ageDays: chl.ageDays } : undefined }) : []), [data, tides, mode, windUnit, spot?.facing, chl])
  const todayKey = dayKey(now)
  // 7 jours à partir d'aujourd'hui ; les créneaux déjà passés d'aujourd'hui sont ignorés.
  const allWindows = useMemo(() => bestWindows(all.filter((s) => s.ts >= now - 3600 && dayKey(s.ts) >= todayKey)), [all, now, todayKey])
  // Les jours affichés dans la rangée et la liste suivent le réglage ; le calendrier donne accès à toutes les prévisions disponibles.
  const windows = useMemo(() => allWindows.slice(0, forecastDays), [allWindows, forecastDays])
  const activeDay = day && day >= todayKey ? day : todayKey
  const inRange = allWindows.some((w) => w.key === activeDay)
  const shown = windows.some((w) => w.key === activeDay)
  const scores = useMemo(() => Object.fromEntries(allWindows.map((w) => [w.key, w.avg])), [allWindows])
  const lastForecast = allWindows[allWindows.length - 1]?.key ?? todayKey
  const dayHours = all.filter((s) => dayKey(s.ts) === activeDay)
  const dayWindow = allWindows.find((w) => w.key === activeDay)
  const bars = dayHours
  const nowHour = all.find((s) => s.ts <= now && now < s.ts + 3600)
  const isToday = activeDay === todayKey
  const defaultFocus = (isToday ? nowHour : undefined) ?? dayHours.find((s) => s.ts === dayWindow?.start) ?? dayHours[0]
  const focus = dayHours.find((s) => s.ts === selected) ?? defaultFocus
  const pick = (clientX: number) => {
    const r = sparkRef.current?.getBoundingClientRect()
    if (!r || !bars.length) return
    const i = Math.min(bars.length - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * bars.length)))
    setSelected(bars[i].ts)
  }
  // Au-delà de 8 jours, Open-Meteo ne prévoit plus ni houle ni marées : le score est partiel.
  const seaDays = useMemo(() => new Set((data?.forecast.hours ?? []).filter((h) => h.wave != null).map((h) => dayKey(h.ts))), [data])
  const partial = (key: string) => !seaDays.has(key)
  const daysAhead = (key: string) => Math.round((noonOf(key) - noonOf(todayKey)) / 86400)
  const hourAt = useMemo(() => new Map((data?.forecast.hours ?? []).map((h) => [h.ts, h])), [data])
  const point = focus ? hourAt.get(focus.ts) : undefined
  const dayTemps = dayHours.map((s) => hourAt.get(s.ts)?.temp).filter((t): t is number => t != null)
  const rain24 = (data?.forecast.hours ?? []).filter((h) => focus && h.ts > focus.ts - 86400 && h.ts <= focus.ts).reduce((n, h) => n + (h.precip ?? 0), 0)
  const dayTides = tides.filter((t) => dayKey(t.ts) === activeDay)
  const chooseDay = (key: string) => {
    setDay(key)
    setSelected(null)
  }
  // Appui long sur un jour : ouvre le calendrier.
  const press = {
    onPointerDown: () => {
      pressed.current = false
      pressTimer.current = setTimeout(() => {
        pressed.current = true
        navigator.vibrate?.(15)
        setCalendar(true)
      }, 450)
    },
    onPointerUp: () => clearTimeout(pressTimer.current),
    onPointerLeave: () => clearTimeout(pressTimer.current),
    onPointerCancel: () => clearTimeout(pressTimer.current),
  }

  return (
    <section>
      <div className="row picker">
        <select value={spot?.id} onChange={(e) => setSpotId(Number(e.target.value))} aria-label="Spot">
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="seg full" role="group" aria-label="Type de sortie">
          <button className={mode === 'bord' ? 'on' : ''} onClick={() => setMode('bord')}>
            Bord de mer
          </button>
          <button className={mode === 'plongee' ? 'on' : ''} onClick={() => setMode('plongee')}>
            Sous-marine
          </button>
        </div>
      </div>

      {vigilance.filter((d) => d.level >= 2).map((d) => (
        <div key={d.when} className={`card vigi v${d.level}`} role="alert">
          <strong>Vigilance {d.color} {d.when}</strong>
          <div className="small">{d.items.map((i) => `${i.phenomenon} (${i.color})`).join(', ') || 'Voir Météo-France'}</div>
        </div>
      ))}

      {data === undefined && <p className="muted">Chargement des prévisions…</p>}
      {data === null && <p className="card warn">Impossible de charger les prévisions et aucune donnée en cache. Reconnecte-toi une fois pour les télécharger.</p>}

      {data && (
        <>
          {data.offline && <p className="card warn">Mode hors ligne : prévisions du {new Date(data.forecast.fetchedAt).toLocaleString('fr-FR')}.</p>}

          <div className="days" role="tablist" aria-label="Jour">
            {windows.map((w, i) => (
              <button key={w.key} role="tab" aria-selected={w.key === activeDay} className={`day ${w.key === activeDay ? 'on' : ''} ${partial(w.key) ? 'partial' : ''}`} {...press} onClick={() => (pressed.current ? (pressed.current = false) : chooseDay(w.key))}>
                <span className="dw">{i === 0 ? 'Auj.' : new Date(w.start * 1000).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' }).replace('.', '')}</span>
                <span className="dn">{new Date(w.start * 1000).toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'Europe/Paris' })}</span>
                <b className={tone(w.avg)}>{w.avg}</b>
              </button>
            ))}
            {!shown && (
              <button role="tab" aria-selected className="day on partial" {...press} onClick={() => setCalendar(true)}>
                <span className="dw">{new Date(noonOf(activeDay) * 1000).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                <span className="dn">{Number(activeDay.slice(8))}</span>
                <b>{inRange ? (dayWindow?.avg ?? '') : 'plan'}</b>
              </button>
            )}
            <button className="day cal" onClick={() => setCalendar(true)} aria-label="Ouvrir le calendrier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              <span className="dw">Date</span>
            </button>
          </div>

          {showRanking && <BestSpots spots={spots} mode={mode} unit={windUnit} dayKey={activeDay} label={isToday ? 'aujourd’hui' : daysAhead(activeDay) === 1 ? 'demain' : `le ${dayLabel(noonOf(activeDay))}`} current={spot?.id} onPick={setSpotId} />}

          {inRange && focus ? (
          <div className="today-grid">
            <div className="col">
          {partial(activeDay) && (
            <p className="card warn small">
              {daysAhead(activeDay) <= 7
                ? 'La houle est indisponible pour le moment (réseau). Touche « Actualiser » dans un instant : en attendant, le score est partiel.'
                : 'Prévision lointaine : au-delà de 8 jours, la houle n’est pas prévue (les marées et le coefficient restent calculés). Le score est ramené vers le neutre : c’est une simple tendance.'}
            </p>
          )}

          <div className={`card score ${tone(focus.score)}`}>
            <div className="big">{focus.score}</div>
            <div>
              <strong>{focus.ts === nowHour?.ts ? 'Maintenant' : `${dayShort(focus.ts)} ${hhmm(focus.ts)}`}</strong>
              <div className="muted">{focus.score >= 70 ? 'Conditions très favorables' : focus.score >= 45 ? 'Conditions correctes' : 'Conditions peu favorables'}</div>
            </div>
          </div>

          {point && (
            <div className="card weather">
              <div className="tiles">
                <div className="tile">
                  <span className="muted small">Air</span>
                  <strong>{point.temp != null ? `${Math.round(point.temp)}°` : '—'}</strong>
                  {point.feels != null && <span className="muted small">ressenti {Math.round(point.feels)}°</span>}
                </div>
                <div className="tile">
                  <span className="muted small">Eau</span>
                  <strong>{point.seaTemp != null ? `${point.seaTemp.toFixed(1)}°` : '—'}</strong>
                  <span className="muted small">mer</span>
                </div>
                <div className="tile">
                  <span className="muted small">Ciel</span>
                  <strong>{point.cloud != null ? `${Math.round(point.cloud)} %` : '—'}</strong>
                  <span className="muted small">nuages</span>
                </div>
                <div className="tile">
                  <span className="muted small">Pluie</span>
                  <strong>{(point.precip ?? 0).toFixed(1)}</strong>
                  <span className="muted small">mm/h · {Math.round(rain24)} mm/24 h</span>
                </div>
              </div>
              {point && (
                <div className="conds">
                  {point.wind != null && (
                    <div className="kv"><span className="muted">Vent</span><span>{fmtWind(point.wind, windUnit)} {point.windDir != null ? compass(point.windDir) : ''}{spot?.facing != null && point.windDir != null ? ` · ${WIND_LABEL[windKind(point.windDir, spot.facing)]}` : ''}</span></div>
                  )}
                  {point.wave != null && (
                    <div className="kv"><span className="muted">Houle</span><span>{point.wave.toFixed(1)} m{point.waveDir != null ? ` de ${compass(point.waveDir)}` : ''}{point.wavePeriod != null ? ` · ${point.wavePeriod.toFixed(0)} s` : ''}{point.waveSrc ? ' · Copernicus' : ''}{spot?.facing != null && point.waveDir != null && (point.waveDir != null && spot?.facing != null ? (swellFactor(point.waveDir, spot.facing) < 0.7 ? ' · spot abrité' : swellFactor(point.waveDir, spot.facing) < 0.95 ? ' · en partie abrité' : '') : '')}</span></div>
                  )}
                  {point.current != null && (
                    <div className="kv"><span className="muted">Courant</span><span>{point.current.toFixed(1)} km/h{point.currentDir != null ? ` vers ${compass(point.currentDir)}` : ''}{point.curSrc ? ` · Copernicus (cellule à ${cm?.phy?.cell.km ?? '?'} km)` : ' · modèle large'}</span></div>
                  )}
                  {cm?.bgc && <div className="kv"><span className="muted">Transparence (modèle)</span><span>≈ {cm.bgc.secchi.toFixed(0)} m · optimiste près des côtes (sans sédiments)</span></div>}
                  {chl && <div className="kv"><span className="muted">Eau (satellite)</span><span>{waterLook(chl.value)} · {chl.value.toFixed(1)} mg/m³ · il y a {chl.ageDays} j</span></div>}
                  {(point.vis != null || point.uv != null || point.pop != null) && (
                    <div className="kv"><span className="muted">Ciel</span><span>{point.vis != null ? `visibilité ${Math.round(point.vis / 1000)} km` : ''}{point.uv != null ? ` · UV ${point.uv.toFixed(0)}` : ''}{point.pop != null ? ` · pluie ${Math.round(point.pop)} %` : ''}</span></div>
                  )}
                  {spot && spot.facing == null && <p className="muted small">Indique l’orientation du spot (Spots → Modifier → « Face à la mer ») pour savoir si le vent vient de la mer ou de la terre.</p>}
                </div>
              )}
              {depth?.depth != null && (() => {
                const pm = dayTides.filter((t) => t.type === 'haute').sort((a, b) => b.height - a.height)[0]
                return <p className="muted small">Fond du spot : {depth.depth < 10 ? depth.depth.toFixed(1) : Math.round(depth.depth)} m au zéro des cartes{pm ? ` · ≈ ${(depth.depth + pm.height).toFixed(0)} m à pleine mer (${hhmm(pm.ts)})` : ''} <span className="muted">(indicatif, EMODnet)</span></p>
              })()}
              {dayTemps.length > 0 && <p className="muted small">Journée : {Math.round(Math.min(...dayTemps))}° à {Math.round(Math.max(...dayTemps))}° (air)</p>}
            </div>
          )}

          <div className="row between muted small updated">
            <span>
              Open-Meteo · mis à jour à {new Date(data.forecast.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button className="mini" onClick={() => refresh(true)} disabled={refreshing} aria-label="Actualiser les prévisions">
              <span className={refreshing ? 'spin' : ''}>↻</span> Actualiser
            </button>
          </div>

          {focus.warnings.map((w) => (
            <p key={w} className="card warn">
              ⚠ {w}
            </p>
          ))}
          {mode === 'plongee' && <p className="muted small">Ne plonge jamais seul, balise de surface obligatoire. La visibilité est une estimation, pas une mesure.</p>}

          <div className="card">
            <h3>Détail</h3>
            {focus.factors.map((f) => (
              <div className="factor" key={f.label}>
                <span>{f.label}</span>
                <div className="bar">
                  <i className={tone(f.value * 100)} style={{ width: `${f.value * 100}%` }} />
                </div>
                <span className="muted small">{f.note}</span>
              </div>
            ))}
          </div>

            </div>
            <div className="col">
          <div className="card">
            <h3>Heure par heure · <span className="cap">{dayLabel(dayHours[0].ts)}</span></h3>
            <div
              className="spark"
              ref={sparkRef}
              role="slider"
              tabIndex={0}
              aria-label="Heure sélectionnée"
              aria-valuemin={0}
              aria-valuemax={bars.length - 1}
              aria-valuenow={Math.max(0, bars.findIndex((b) => b.ts === focus.ts))}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                pick(e.clientX)
              }}
              onPointerMove={(e) => e.buttons && pick(e.clientX)}
              onKeyDown={(e) => {
                const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                if (!k) return
                e.preventDefault()
                const at = Math.max(0, bars.findIndex((b) => b.ts === focus.ts))
                setSelected(bars[Math.min(bars.length - 1, Math.max(0, at + k))].ts)
              }}
            >
              {bars.map((s) => (
                <i key={s.ts} className={`${tone(s.score)} ${s.ts === focus.ts ? 'sel' : ''} ${isToday && s.ts + 3600 <= now ? 'past' : ''} ${s.ts === nowHour?.ts ? 'now' : ''}`} style={{ height: `${Math.max(8, s.score)}%` }} />
              ))}
            </div>
            <div className="axis" aria-hidden="true"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>
            <div className="muted small">Touche, clique ou glisse sur les barres pour voir le détail de chaque heure.</div>
          </div>

          <div className="card">
            <h3>Prévisions sur {windows.length} jours</h3>
            <p className="muted small">Meilleur créneau de 2 h de chaque jour. Touche un jour pour le détailler.</p>
            {windows.map((w) => (
              <div className={`win pick ${w.key === activeDay ? 'on' : ''}`} key={w.key} onClick={() => chooseDay(w.key)}>
                <span className="cap">{w.day}</span>
                <span>
                  {hhmm(w.start)} – {hhmm(w.end)}
                </span>
                <b className={tone(w.avg)}>{w.avg}</b>
              </div>
            ))}
          </div>

          {isToday && spot && <WebcamsCard lat={spot.lat} lon={spot.lon} />}
          {isToday && spot && <LiveTide lat={spot.lat} lon={spot.lon} />}

          <div className="card">
            <h3>Marées · <span className="cap">{dayLabel(focus.ts)}</span></h3>
            {dayTides.length ? (
              dayTides.map((t) => (
                <div className="win" key={t.ts}>
                  <span className="cap">{t.type === 'haute' ? 'Pleine mer' : 'Basse mer'}</span>
                  <span>{hhmm(t.ts)}</span>
                  <span className="muted">{t.height.toFixed(1)} m</span>
                </div>
              ))
            ) : (
              <p className="muted small">Pas de données de marée pour ce point.</p>
            )}
            {dayTides.some((t) => t.type === 'haute') && (
              <div className="kv"><span className="muted">Coefficient</span><span>{dayTides.filter((t) => t.type === 'haute').map((t) => coefficientAt(t.ts)).join(' · ')}</span></div>
            )}
            <p className="muted small">
              {moonLabel(focus.ts)}. {stationInfo && stationInfo.distance < 120 ? `Horaires et hauteurs calculés d’après la jauge de ${stationInfo.station.name} (${Math.round(stationInfo.distance)} km) : sur ton spot ils peuvent différer, surtout en rivière ou derrière une barre. ` : ''}Coefficient calculé d’après les marées de Brest, à 2-3 points près de la valeur officielle du SHOM.
            </p>
          </div>
            </div>
          </div>
          ) : (
            <PlanCard dayKey={activeDay} spot={spot} mode={mode} />
          )}
        </>
      )}

      {calendar && (
        <Calendar
          value={activeDay}
          min={todayKey}
          lastForecast={lastForecast}
          scores={scores}
          onPick={(k) => {
            chooseDay(k)
            setCalendar(false)
          }}
          onClose={() => setCalendar(false)}
        />
      )}
    </section>
  )
}
