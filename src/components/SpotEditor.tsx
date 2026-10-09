import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { depthAt, describeDepth, detectFacing, type Depth } from '../lib/bathy'
import { compass } from '../lib/exposure'
import { PIN_KIND_CHOICES, SPOT_KINDS, SPOT_KIND_CHOICES, type Spot, type SpotKind } from '../lib/types'

export interface SpotDraft {
  id?: number
  name: string
  lat: number
  lon: number
  kind?: SpotKind
  notes?: string
  facing?: number
  /** Marqueur personnel sans prévisions. */
  pin?: boolean
  /** Précision du GPS en mètres, quand la position vient du GPS. */
  accuracy?: number
}

const getPosition = () => new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }))

/** Feuille d'édition d'un spot : nom, nature du lieu, notes, position, profondeur automatique. */
export function SpotEditor({ spot, onSave, onClose }: { spot: SpotDraft | Spot; onSave: (d: SpotDraft) => void; onClose: () => void }) {
  const [name, setName] = useState(spot.name)
  const [kind, setKind] = useState<SpotKind | undefined>(spot.kind)
  const [notes, setNotes] = useState(spot.notes ?? '')
  const [facing, setFacing] = useState<number | undefined>(spot.facing)
  const [detecting, setDetecting] = useState(false)
  const [pos, setPos] = useState({ lat: spot.lat, lon: spot.lon })
  const [depth, setDepth] = useState<Depth | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState<number | undefined>((spot as SpotDraft).accuracy)
  const pin = !!(spot as SpotDraft).pin

  useEffect(() => {
    setDepth(undefined)
    let cancelled = false
    depthAt(pos.lat, pos.lon).then((d) => !cancelled && setDepth(d))
    return () => {
      cancelled = true
    }
  }, [pos.lat, pos.lon])

  async function detect() {
    setDetecting(true)
    setError('')
    const r = await detectFacing(pos.lat, pos.lon)
    setDetecting(false)
    if (r) setFacing(Math.round(r.facing / 45) * 45 % 360)
    else setError('Orientation non détectée : le spot est en pleine mer ou loin de la côte. Choisis-la à la main ou laisse « Aucune ».')
  }

  async function here() {
    try {
      const p = await getPosition()
      setPos({ lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)) })
      setAccuracy(Math.round(p.coords.accuracy))
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
          if (!name.trim()) return setError(pin ? 'Donne un nom à ce coin' : 'Donne un nom au spot')
          onSave({ id: (spot as Spot).id, name: name.trim(), kind, notes: notes.trim() || undefined, facing: pin ? undefined : facing, pin: pin || undefined, ...pos })
        }}
      >
        <div className="grabber" />
        <h3>{pin ? ((spot as Spot).id ? 'Modifier le coin' : 'Nouveau coin marqué') : (spot as Spot).id ? 'Modifier le spot' : 'Nouveau spot'}</h3>
        <input placeholder={pin ? 'Ex. Coin à homard de la pointe' : 'Nom du coin'} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!(spot as Spot).id} />
        <div className="chips" role="group" aria-label="Nature du lieu">
          {(pin ? PIN_KIND_CHOICES : SPOT_KIND_CHOICES).map((k) => [k, SPOT_KINDS[k]] as [SpotKind, string]).map(([k, label]) => (
            <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? undefined : k)}>
              {label}
            </button>
          ))}
        </div>
        {!pin && (
        <div>
          <div className="row between">
            <span>Face à la mer vers</span>
            <button type="button" className="mini" onClick={detect} disabled={detecting}>{detecting ? 'Analyse…' : '🧭 Détecter'}</button>
          </div>
          <div className="chips" role="group" aria-label="Orientation du spot">
            <button type="button" className={facing == null ? 'on' : ''} onClick={() => setFacing(undefined)}>Aucune</button>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
              <button type="button" key={d} className={facing === d ? 'on' : ''} onClick={() => setFacing(d)}>{compass(d)}</button>
            ))}
          </div>
          <p className="muted small">Sert à savoir si le vent vient de la mer ou de la terre, et si le spot est abrité de la houle.</p>
        </div>
        )}
        <textarea placeholder={pin ? 'Profondeur, fond, casiers posés, appât, accès, date de la prise…' : 'Infos : fond, courant, accès, meilleur moment, appâts…'} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="kv">
          <span className="muted">Position</span>
          <span>{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}{accuracy != null ? ` · ± ${accuracy} m` : ''}</span>
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
