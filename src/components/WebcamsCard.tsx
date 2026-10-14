import { useEffect, useState } from 'react'
import { camKind } from '../lib/mycams'
import { fetchWebcams, type Webcam } from '../lib/webcams'
import type { MyCam } from '../lib/types'

/** Webcams publiques proches du spot : l'état réel de la mer en direct. Rien ne s'affiche s'il n'y en a pas ou si la clé n'est pas configurée. */
export function WebcamsCard({ lat, lon, mine = [] }: { lat: number; lon: number; mine?: MyCam[] }) {
  const [cams, setCams] = useState<Webcam[]>([])
  // Les images « en direct » sont rechargées chaque minute
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 60000))
  useEffect(() => {
    if (!mine.length) return
    const t = setInterval(() => setTick(Math.floor(Date.now() / 60000)), 60000)
    return () => clearInterval(t)
  }, [mine.length])

  useEffect(() => {
    setCams([])
    let cancelled = false
    const load = () => fetchWebcams(lat, lon).then((l) => !cancelled && setCams(l))
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [lat, lon])

  if (!cams.length && !mine.length) return null
  return (
    <>
    {mine.length > 0 && (
      <div className="card cams">
        <h3>Mes webcams</h3>
        <div className="cam-row">
          {mine.map((c, i) => <MyCamTile key={`${i}-${c.url}`} cam={c} tick={tick} />)}
        </div>
      </div>
    )}
    {cams.length > 0 && (
    <div className="card cams">
      <h3>Webcams proches</h3>
      <div className="cam-row">
        {cams.map((c) => (
          <a key={c.id} className="cam" href={c.detail ?? 'https://www.windy.com/webcams'} target="_blank" rel="noopener noreferrer">
            <img src={c.image} alt={c.title} loading="lazy" referrerPolicy="no-referrer" />
            <span className="cam-t">{c.title}</span>
            <span className="muted small">{c.city ? `${c.city} · ` : ''}{c.distanceKm != null ? `${c.distanceKm} km` : ''}</span>
          </a>
        ))}
      </div>
      <p className="muted small">Webcams publiques fournies par <a href="https://www.windy.com/webcams" target="_blank" rel="noopener noreferrer">Windy.com</a>. Touche une image pour la voir en direct.</p>
    </div>
    )}
    </>
  )
}

function MyCamTile({ cam, tick }: { cam: MyCam; tick: number }) {
  const k = camKind(cam.url)
  const [broken, setBroken] = useState(false)
  if (k.kind === 'youtube')
    return (
      <div className="cam wide">
        <iframe src={k.src} title={cam.name} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        <span className="cam-t">{cam.name}</span>
      </div>
    )
  if (k.kind === 'image' && !broken)
    return (
      <a className="cam wide" href={cam.url} target="_blank" rel="noopener noreferrer">
        <img src={`${k.src}${k.src.includes('?') ? '&' : '?'}_=${tick}`} alt={cam.name} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        <span className="cam-t">{cam.name}</span>
        <span className="muted small">image rafraîchie chaque minute</span>
      </a>
    )
  return (
    <a className="cam link" href={cam.url} target="_blank" rel="noopener noreferrer">
      <span className="cam-ph">📹</span>
      <span className="cam-t">{cam.name}</span>
      <span className="muted small">{broken ? 'image indisponible · ouvrir la page' : 'ouvrir la webcam'}</span>
    </a>
  )
}
