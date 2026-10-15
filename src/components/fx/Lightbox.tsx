import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLook } from '../../lib/look'

type Open = { src: string; rect: DOMRect }
const listeners = new Set<(o: Open) => void>()

/** Agrandit une photo en plein écran depuis sa position (et la ramène à sa place à la fermeture). */
export function openPhoto(img: HTMLImageElement) {
  const o = { src: img.currentSrc || img.src, rect: img.getBoundingClientRect() }
  listeners.forEach((l) => l(o))
}

export function Lightbox() {
  const { motion } = useLook()
  const [open, setOpen] = useState<Open | null>(null)
  const img = useRef<HTMLImageElement>(null)
  const back = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const l = (o: Open) => setOpen(o)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])

  // Animation « FLIP » : l'image part de la vignette et grandit jusqu'à sa place finale
  const flip = (reverse: boolean) => {
    const el = img.current
    if (!el || !open || motion === 'off') return Promise.resolve()
    const end = el.getBoundingClientRect()
    const s = open.rect
    const from = `translate(${s.left + s.width / 2 - (end.left + end.width / 2)}px, ${s.top + s.height / 2 - (end.top + end.height / 2)}px) scale(${s.width / end.width}, ${s.height / end.height})`
    const frames = [{ transform: from, borderRadius: '10px' }, { transform: 'none', borderRadius: '0px' }]
    back.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, direction: reverse ? 'reverse' : 'normal', fill: 'forwards' })
    return el.animate(reverse ? frames.reverse() : frames, { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished
  }

  if (!open) return null
  return createPortal(
    <div className="lightbox" ref={back} onClick={() => void flip(true).then(() => setOpen(null))} role="dialog" aria-label="Photo en grand">
      <img ref={img} src={open.src} alt="Photo en grand" onLoad={() => void flip(false)} />
    </div>,
    document.body,
  )
}
