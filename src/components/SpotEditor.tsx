import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { depthAt, describeDepth, type Depth } from '../lib/bathy'
import { SPOT_KINDS, type Spot, type SpotKind } from '../lib/types'

export interface SpotDraft {
  id?: number
  name: string
  lat: number
  lon: number
  kind?: SpotKind
  notes?: string
}

const getPosition = () => new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }))

/** Feuille d'édition d'un spot : nom, nature du lieu, notes, position, profondeur automatique. */
export function SpotEditor({ spot, onSave, onClose }: { spot: SpotDraft | Spot; onSave: (d: SpotDraft) => void; onClose: () => void }) {
  const [name, setName] = useState(spot.name)
  const [kind, setKind] = useState<SpotKind | undefined>(spot.kind)
  const [notes, setNotes] = useState(spot.notes ?? '')
  const [pos, setPos] = useState({ lat: spot.lat, lon: spot.lon })
  const [depth, setDepth] = useState<Depth | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    setDepth(undefined)
    let cancelled = false
    depthAt(pos.lat, pos.lon).then((d) => !cancelled && setDepth(d))
    return () => {
      cancelled = true
    }
  }, [pos.lat, pos.lon])

  async function here() {
    try {
      const p = await getPosition()
      setPos({ lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)) })
      setError('')
    } catch {
      setError('Position indisponible')
    }
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return setError('Donne un nom au spot')
          onSave({ id: (spot as Spot).id, name: name.trim(), kind, notes: notes.trim() || undefined, ...pos })
        }}
      >
        <div className="grabber" />
        <h3>{(spot as Spot).id ? 'Modifier le spot' : 'Nouveau spot'}</h3>
        <input placeholder="Nom du coin" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!(spot as Spot).id} />
        <div className="chips" role="group" aria-label="Nature du lieu">
          {(Object.entries(SPOT_KINDS) as [SpotKind, string][]).map(([k, label]) => (
            <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? undefined : k)}>
              {label}
            </button>
          ))}
        </div>
        <textarea placeholder="Infos : fond, courant, accès, meilleur moment, appâts…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="kv">
          <span className="muted">Position</span>
          <span>{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</span>
        </div>
        <div className="kv">
          <span className="muted">Profondeur (cartes)</span>
          <span>{depth === undefined ? '…' : describeDepth(depth)}</span>
        </div>
        <button type="button" onClick={here}>📍 Placer à ma position</button>
        {error && <p className="warn small">{error}</p>}
        <div className="row">
          <button type="button" onClick={onClose}>Annuler</button>
          <button className="primary">Enregistrer</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
