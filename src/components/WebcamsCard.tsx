import { useEffect, useState } from 'react'
import { fetchWebcams, type Webcam } from '../lib/webcams'

/** Webcams publiques proches du spot : l'état réel de la mer en direct. Rien ne s'affiche s'il n'y en a pas ou si la clé n'est pas configurée. */
export function WebcamsCard({ lat, lon }: { lat: number; lon: number }) {
  const [cams, setCams] = useState<Webcam[]>([])

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

  if (!cams.length) return null
  return (
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
  )
}
