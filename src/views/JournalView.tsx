import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { findTides, loadForecast } from '../lib/forecast'
import { shrinkPhoto } from '../lib/photo'
import { scoreSeries } from '../lib/scoring'
import { addTrip, liveTrips, photoBlobs, removeTrip } from '../lib/store'
import { SPECIES } from '../lib/species'
import type { CatchItem, Mode, Spot, Trip } from '../lib/types'

const fmt = (ms: number) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

function Photos({ uids }: { uids: string[] }) {
  const [blobs, setBlobs] = useState<Blob[]>([])
  const key = uids.join()
  useEffect(() => {
    const sub = liveQuery(() => photoBlobs(uids)).subscribe(setBlobs)
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return <Gallery blobs={blobs} />
}

function Gallery({ blobs }: { blobs: Blob[] }) {
  const urls = useMemo(() => blobs.map((b) => URL.createObjectURL(b)), [blobs])
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls])
  return (
    <div className="photos">
      {urls.map((u) => (
        <img key={u} src={u} alt="Prise" />
      ))}
    </div>
  )
}

function Report({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  return (
    <div className="report">
      <div className="no-print row between">
        <button onClick={onClose}>← Retour</button>
        <button className="primary" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>
      <h2>Rapport de sortie</h2>
      <p>
        <strong>{trip.spotName}</strong> · {trip.mode === 'bord' ? 'Pêche du bord' : 'Chasse sous-marine'}
        <br />
        {fmt(trip.date)}
      </p>
      {trip.snapshot && (
        <p className="muted">
          Conditions : vent {trip.snapshot.wind != null ? `${Math.round(trip.snapshot.wind)} km/h` : '?'} · houle {trip.snapshot.wave?.toFixed(1) ?? '?'} m · eau {trip.snapshot.seaTemp?.toFixed(1) ?? '?'} °C · pression {trip.snapshot.pressure != null ? `${Math.round(trip.snapshot.pressure)} hPa` : '?'}
          {trip.snapshot.score != null && ` · score prévu ${trip.snapshot.score}/100`}
        </p>
      )}
      <h3>Prises</h3>
      {trip.catches.length === 0 ? <p>Bredouille.</p> : <ul>{trip.catches.map((c, i) => <li key={i}>{c.species}{c.sizeCm ? ` · ${c.sizeCm} cm` : ''}{c.weightKg ? ` · ${c.weightKg} kg` : ''}</li>)}</ul>}
      {trip.notes && <><h3>Notes</h3><p>{trip.notes}</p></>}
      <Photos uids={trip.photoUids} />
    </div>
  )
}

export function JournalView({ spots, mode: defaultMode }: { spots: Spot[]; mode: Mode }) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [open, setOpen] = useState<Trip | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const sub = liveQuery(liveTrips).subscribe(setTrips)
    return () => sub.unsubscribe()
  }, [])

  if (open) return <Report trip={open} onClose={() => setOpen(null)} />

  async function exportAll() {
    const toUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })
    const rows = await Promise.all(trips.map(async (t) => ({ ...t, photos: await Promise.all((await photoBlobs(t.photoUids)).map(toUrl)) })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ spots, trips: rows }, null, 1)], { type: 'application/json' }))
    a.download = `peche-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  return (
    <section>
      {adding ? (
        <TripForm spots={spots} defaultMode={defaultMode} onDone={() => setAdding(false)} />
      ) : (
        <div className="row">
          <button className="primary" onClick={() => setAdding(true)}>+ Nouvelle sortie</button>
          {trips.length > 0 && <button onClick={exportAll}>Sauvegarde</button>}
        </div>
      )}
      {trips.map((t) => (
        <div className="card" key={t.id}>
          <div className="row between">
            <strong>{t.spotName}</strong>
            <span className="muted small">{fmt(t.date)}</span>
          </div>
          <div>{t.catches.length ? t.catches.map((c) => c.species + (c.sizeCm ? ` ${c.sizeCm} cm` : '')).join(', ') : 'Bredouille'}</div>
          <Photos uids={t.photoUids.slice(0, 3)} />
          <div className="row">
            <button onClick={() => setOpen(t)}>Rapport</button>
            <button onClick={() => confirm('Supprimer cette sortie ?') && removeTrip(t.id!)}>🗑</button>
          </div>
        </div>
      ))}
      {!adding && trips.length === 0 && <p className="muted">Aucune sortie pour l’instant. Chaque sortie enregistrée garde aussi les conditions du moment, pour apprendre ce qui marche chez toi.</p>}
    </section>
  )
}

function TripForm({ spots, defaultMode, onDone }: { spots: Spot[]; defaultMode: Mode; onDone: () => void }) {
  const [spotId, setSpotId] = useState(spots[0]?.id)
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [date, setDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))
  const [catches, setCatches] = useState<CatchItem[]>([])
  const [photos, setPhotos] = useState<Blob[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const patch = (i: number, p: Partial<CatchItem>) => setCatches((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const spot = spots.find((s) => s.id === spotId)
    if (!spot) return
    setBusy(true)
    const ts = new Date(date).getTime()
    let snapshot: Trip['snapshot']
    const res = await loadForecast(spot)
    if (res) {
      const sec = ts / 1000
      const f = res.forecast
      const h = f.hours.find((x) => Math.abs(x.ts - sec) <= 1800)
      if (h) {
        const sc = scoreSeries(f, findTides(f.hours), mode, 0).find((s) => s.ts === h.ts)
        snapshot = { wind: h.wind, wave: h.wave, seaTemp: h.seaTemp, pressure: h.pressure, score: sc?.score ?? null }
      }
    }
    await addTrip({ date: ts, spot, mode, notes: notes.trim() || undefined, catches: catches.filter((c) => c.species), photos, snapshot })
    onDone()
  }

  return (
    <form className="card" onSubmit={save}>
      <h3>Nouvelle sortie</h3>
      <select value={spotId} onChange={(e) => setSpotId(Number(e.target.value))}>
        {spots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="seg">
        <button type="button" className={mode === 'bord' ? 'on' : ''} onClick={() => setMode('bord')}>Bord de mer</button>
        <button type="button" className={mode === 'plongee' ? 'on' : ''} onClick={() => setMode('plongee')}>Sous-marine</button>
      </div>
      <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
      <datalist id="species">{SPECIES.map((s) => <option key={s.name} value={s.name} />)}</datalist>
      {catches.map((c, i) => (
        <div className="row" key={i}>
          <input list="species" placeholder="Espèce" value={c.species} onChange={(e) => patch(i, { species: e.target.value })} />
          <input className="num" placeholder="cm" inputMode="decimal" value={c.sizeCm ?? ''} onChange={(e) => patch(i, { sizeCm: Number(e.target.value) || undefined })} />
          <input className="num" placeholder="kg" inputMode="decimal" value={c.weightKg ?? ''} onChange={(e) => patch(i, { weightKg: Number(e.target.value.replace(',', '.')) || undefined })} />
        </div>
      ))}
      <button type="button" onClick={() => setCatches([...catches, { species: '' }])}>+ Ajouter une prise</button>
      <input type="file" accept="image/*" multiple onChange={async (e) => setPhotos([...photos, ...(await Promise.all([...(e.target.files ?? [])].map((f) => shrinkPhoto(f))))])} />
      {photos.length > 0 && <Gallery blobs={photos} />}
      <textarea placeholder="Notes (appât, courant, comportement du poisson…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <button type="button" onClick={onDone}>Annuler</button>
        <button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}
