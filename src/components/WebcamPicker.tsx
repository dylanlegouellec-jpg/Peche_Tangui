import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditing } from '../lib/editing'
import { fetchWebcams, type Webcam } from '../lib/webcams'

const MAX = 12

/** Choix des webcams Windy d'un spot : lesquelles, et dans quel ordre. */
export function WebcamPicker({ lat, lon, chosen, current, onSave, onClose }: { lat: number; lon: number; chosen?: string[]; current: Webcam[]; onSave: (ids: string[] | undefined) => void; onClose: () => void }) {
  useEditing()
  const [all, setAll] = useState<Webcam[] | null>(null)
  const [sel, setSel] = useState<string[]>(() => chosen ?? current.map((c) => c.id))

  useEffect(() => {
    let alive = true
    fetchWebcams(lat, lon, { all: true }).then((l) => alive && setAll(l))
    return () => {
      alive = false
    }
  }, [lat, lon])

  // Les webcams déjà choisies mais hors de la liste élargie restent connues grâce à la liste actuelle
  const known = new Map([...current, ...(all ?? [])].map((c) => [c.id, c]))
  const move = (i: number, d: number) => setSel((l) => {
    const j = i + d
    if (j < 0 || j >= l.length) return l
    const n = [...l]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  const others = (all ?? []).filter((c) => !sel.includes(c.id))

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <h3>Webcams de ce spot</h3>
        <p className="muted small">Choisis celles à afficher et leur ordre (la première en tête). {sel.length}/{MAX}</p>
        {sel.length === 0 && <p className="muted small">Aucune webcam Windy ne sera affichée pour ce spot.</p>}
        {sel.map((id, i) => {
          const c = known.get(id)
          return (
            <div className="pick-row on" key={id}>
              {c ? <img src={c.image} alt="" referrerPolicy="no-referrer" /> : <span className="pick-ph">📹</span>}
              <span className="grow">{c?.title ?? `Webcam ${id}`}<span className="muted small">{c?.distanceKm != null ? ` · ${c.distanceKm} km` : ''}</span></span>
              <button type="button" className="mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">↑</button>
              <button type="button" className="mini" onClick={() => move(i, 1)} disabled={i === sel.length - 1} aria-label="Descendre">↓</button>
              <button type="button" className="mini" onClick={() => setSel(sel.filter((x) => x !== id))} aria-label="Retirer">✕</button>
            </div>
          )
        })}
        <h3 className="sec">Autres webcams jusqu’à 80 km</h3>
        {all === null && <p className="muted small">Recherche…</p>}
        {all?.length === 0 && <p className="muted small">Aucune autre webcam trouvée (ou service indisponible).</p>}
        {others.map((c) => (
          <div className="pick-row" key={c.id}>
            <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <span className="grow">{c.title}<span className="muted small">{c.distanceKm != null ? ` · ${c.distanceKm} km` : ''}</span></span>
            <button type="button" className="mini" disabled={sel.length >= MAX} onClick={() => setSel([...sel, c.id])} aria-label={`Ajouter ${c.title}`}>＋</button>
          </div>
        ))}
        <div className="row sticky-actions">
          <button type="button" onClick={() => onSave(undefined)}>Automatique</button>
          <button type="button" className="primary" onClick={() => onSave(sel)}>Enregistrer</button>
        </div>
        <p className="muted small">« Automatique » revient aux webcams les plus proches.</p>
      </div>
    </div>,
    document.body,
  )
}
