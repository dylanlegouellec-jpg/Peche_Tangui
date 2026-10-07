import { useState } from 'react'
import { SpotEditor, type SpotDraft } from '../components/SpotEditor'
import { SpotsMap } from '../components/SpotsMap'
import { addSpot, removeSpot, updateSpot } from '../lib/store'
import { compass } from '../lib/exposure'
import { SPOT_KINDS, type Spot } from '../lib/types'

const getPosition = () => new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }))

export function SpotsView({ spots, onOpenSpot }: { spots: Spot[]; onOpenSpot: (id: number) => void }) {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [editing, setEditing] = useState<SpotDraft | Spot | null>(null)

  async function save(d: SpotDraft) {
    if (d.id != null) await updateSpot(d.id, { name: d.name, kind: d.kind, notes: d.notes, facing: d.facing, lat: d.lat, lon: d.lon })
    else await addSpot({ name: d.name, lat: d.lat, lon: d.lon, kind: d.kind, notes: d.notes, facing: d.facing })
    setEditing(null)
  }

  async function moveHere(s: Spot) {
    try {
      const p = await getPosition()
      if (confirm(`Placer « ${s.name} » à ta position actuelle ?`)) await updateSpot(s.id!, { lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)), notes: s.notes?.startsWith('Position approximative') ? undefined : s.notes })
    } catch {
      alert('Position indisponible')
    }
  }

  return (
    <section>
      <div className="seg full" role="group" aria-label="Affichage">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Liste</button>
        <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>Carte</button>
      </div>

      {view === 'map' && (
        <>
          <SpotsMap spots={spots} onOpen={onOpenSpot} onAdd={(lat, lon) => setEditing({ name: '', lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) })} onEdit={setEditing} />
          <p className="muted small">Pastilles : vert = prises, bleu = sorties sans prise, gris = pas encore pêché. Touche la carte pour connaître la profondeur, appui long pour créer un spot.</p>
        </>
      )}

      {view === 'list' && (
        <>
          <button className="primary wide" onClick={() => setEditing({ name: '', lat: 47.6, lon: -3.15 })}>+ Nouveau spot</button>
          <div className="cols-2">
            {spots.map((s) => (
              <div className="card" key={s.id}>
                <div className="row between">
                  <div>
                    <strong>{s.name}</strong> {s.kind && <span className="tag">{SPOT_KINDS[s.kind]}</span>}
                    <div className="muted small">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}{s.facing != null ? ` · face ${compass(s.facing)}` : ''}</div>
                  </div>
                  <button onClick={() => confirm(`Supprimer « ${s.name} » ?`) && removeSpot(s.id!)} aria-label="Supprimer">🗑</button>
                </div>
                {s.notes && <div className={`small ${s.notes.startsWith('Position approximative') ? 'warn' : 'muted'}`}>{s.notes}</div>}
                <div className="row">
                  <button onClick={() => setEditing(s)}>✎ Modifier / infos</button>
                  <button onClick={() => moveHere(s)}>📍 Placer ici</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && <SpotEditor spot={editing} onSave={save} onClose={() => setEditing(null)} />}
    </section>
  )
}
