import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditing } from '../lib/editing'
import { fetchWebcams, type Webcam } from '../lib/webcams'

const MAX = 12
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Identifiant Windy dans un lien (windy.com/webcams/1234567890) ou un nombre seul. */
const windyId = (q: string) => q.match(/webcams\/(\d{6,12})/)?.[1] ?? (/^\d{6,12}$/.test(q.trim()) ? q.trim() : null)

/** Choix des webcams Windy d'un spot : glisser-déposer pour l'ordre, recherche pour en ajouter. */
export function WebcamPicker({ lat, lon, chosen, current, onSave, onClose }: { lat: number; lon: number; chosen?: string[]; current: Webcam[]; onSave: (ids: string[] | undefined) => void; onClose: () => void }) {
  useEditing()
  const [all, setAll] = useState<Webcam[] | null>(null)
  const [wide, setWide] = useState(false)
  const [extra, setExtra] = useState<Webcam[]>([])
  const [sel, setSel] = useState<string[]>(() => chosen ?? current.map((c) => c.id))
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; h: number } | null>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    let alive = true
    setAll(null)
    fetchWebcams(lat, lon, { all: true, wide }).then((l) => alive && setAll(l))
    return () => {
      alive = false
    }
  }, [lat, lon, wide])

  const known = new Map([...current, ...extra, ...(all ?? [])].map((c) => [c.id, c]))
  const moveTo = (id: string, to: number) =>
    setSel((l) => {
      const from = l.indexOf(id)
      const t = Math.max(0, Math.min(l.length - 1, to))
      if (from < 0 || t === from) return l
      const n = [...l]
      n.splice(from, 1)
      n.splice(t, 0, id)
      return n
    })

  // Glisser-déposer au doigt ou à la souris, par la poignée ⠿ : la ligne suit le doigt et prend la place de ses voisines au passage
  const onDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const h = (rows.current.get(id)?.getBoundingClientRect().height ?? 52) + 4
    setDrag({ id, startY: e.clientY, dy: 0, h })
    navigator.vibrate?.(10)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dy = e.clientY - drag.startY
    const steps = Math.trunc(dy / drag.h + (dy > 0 ? 0.5 : -0.5))
    if (steps) {
      const from = sel.indexOf(drag.id)
      const to = Math.max(0, Math.min(sel.length - 1, from + steps))
      if (to !== from) {
        moveTo(drag.id, to)
        return setDrag({ ...drag, startY: drag.startY + (to - from) * drag.h, dy: dy - (to - from) * drag.h })
      }
    }
    setDrag({ ...drag, dy })
  }
  const onUp = () => setDrag(null)

  async function addById(id: string) {
    setMsg('Recherche de la webcam…')
    const [c] = await fetchWebcams(lat, lon, { ids: [id] })
    if (!c) return setMsg('Webcam introuvable ou inactive sur Windy.')
    setExtra((x) => [...x, c])
    if (!sel.includes(c.id)) setSel((l) => [...l, c.id])
    setMsg(`Ajoutée : ${c.title}`)
    setQ('')
  }

  const words = norm(q).split(/\s+/).filter(Boolean)
  const others = (all ?? []).filter((c) => !sel.includes(c.id) && words.every((w) => norm(`${c.title} ${c.city ?? ''}`).includes(w)))
  const idInQuery = windyId(q)

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <h3>Webcams de ce spot</h3>
        <p className="muted small">Fais glisser avec la poignée ⠿ pour changer l’ordre : la première s’affiche en tête. {sel.length}/{MAX}</p>
        {sel.length === 0 && <p className="muted small">Aucune webcam Windy ne sera affichée pour ce spot.</p>}
        <div className="pick-list" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {sel.map((id, i) => {
            const c = known.get(id)
            const dragging = drag?.id === id
            return (
              <div
                className={`pick-row on ${dragging ? 'dragging' : ''}`}
                key={id}
                ref={(el) => void (el ? rows.current.set(id, el) : rows.current.delete(id))}
                style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
              >
                <button
                  type="button"
                  className="grip"
                  aria-label={`Déplacer ${c?.title ?? 'la webcam'} (flèches haut et bas)`}
                  onPointerDown={onDown(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      moveTo(id, i + (e.key === 'ArrowUp' ? -1 : 1))
                    }
                  }}
                >
                  ⠿
                </button>
                <span className="pick-n">{i + 1}</span>
                {c ? <img src={c.image} alt="" referrerPolicy="no-referrer" draggable={false} /> : <span className="pick-ph">📹</span>}
                <span className="grow">{c?.title ?? `Webcam ${id}`}<span className="muted small">{c?.distanceKm != null ? ` · ${c.distanceKm} km` : ''}</span></span>
                <button type="button" className="mini" onClick={() => setSel(sel.filter((x) => x !== id))} aria-label="Retirer">✕</button>
              </div>
            )
          })}
        </div>

        <h3 className="sec">Ajouter une webcam</h3>
        <input type="search" className="pick-search" placeholder="🔍 Ville, port, plage… ou lien Windy" value={q} onChange={(e) => { setQ(e.target.value); setMsg('') }} autoCapitalize="off" autoCorrect="off" />
        {idInQuery && !sel.includes(idInQuery) && (
          <button type="button" className="primary wide" disabled={sel.length >= MAX} onClick={() => void addById(idInQuery)}>Ajouter la webcam Windy n° {idInQuery}</button>
        )}
        {msg && <p className="muted small">{msg}</p>}
        {all === null && <p className="muted small">Recherche des webcams {wide ? 'jusqu’à 250 km' : 'jusqu’à 80 km'}…</p>}
        {all !== null && !idInQuery && <p className="muted small">{others.length} webcam{others.length > 1 ? 's' : ''} {q ? 'trouvée' + (others.length > 1 ? 's' : '') : 'disponible' + (others.length > 1 ? 's' : '')} jusqu’à {wide ? '250' : '80'} km</p>}
        {others.map((c) => (
          <div className="pick-row" key={c.id}>
            <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <span className="grow">{c.title}<span className="muted small">{c.distanceKm != null ? ` · ${c.distanceKm} km` : ''}</span></span>
            <button type="button" className="mini" disabled={sel.length >= MAX} onClick={() => setSel([...sel, c.id])} aria-label={`Ajouter ${c.title}`}>＋</button>
          </div>
        ))}
        {all !== null && !wide && <button type="button" className="wide" onClick={() => setWide(true)}>Chercher plus loin (jusqu’à 250 km)</button>}
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
