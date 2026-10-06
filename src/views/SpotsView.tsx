import { useState } from 'react'
import { db } from '../lib/db'
import type { Spot } from '../lib/types'

const getPosition = () =>
  new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }))

export function SpotsView({ spots }: { spots: Spot[] }) {
  const [name, setName] = useState('')
  const [coords, setCoords] = useState('')
  const [error, setError] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const m = coords.match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/)
    if (!name.trim() || !m) return setError('Nom et coordonnées requis, ex : 47.48, -3.12')
    await db.spots.add({ name: name.trim(), lat: Number(m[1].replace(',', '.')), lon: Number(m[2].replace(',', '.')) })
    setName('')
    setCoords('')
    setError('')
  }

  async function here() {
    try {
      const p = await getPosition()
      setCoords(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`)
    } catch {
      setError('Position indisponible')
    }
  }

  async function moveHere(s: Spot) {
    try {
      const p = await getPosition()
      if (confirm(`Placer « ${s.name} » à ta position actuelle ?`)) await db.spots.update(s.id!, { lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)), notes: undefined })
    } catch {
      alert('Position indisponible')
    }
  }

  return (
    <section>
      <form className="card" onSubmit={add}>
        <h3>Ajouter un spot</h3>
        <input placeholder="Nom du coin" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Latitude, longitude (ex : 47.48, -3.12)" value={coords} onChange={(e) => setCoords(e.target.value)} inputMode="decimal" />
        <div className="row">
          <button type="button" onClick={here}>📍 Ma position</button>
          <button className="primary">Ajouter</button>
        </div>
        {error && <p className="warn small">{error}</p>}
      </form>
      {spots.map((s) => (
        <div className="card" key={s.id}>
          <div className="row between">
            <div>
              <strong>{s.name}</strong>
              <div className="muted small">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}</div>
            </div>
            <div className="row">
              <button onClick={() => moveHere(s)} title="Placer ici">📍 Placer ici</button>
              <button onClick={() => confirm(`Supprimer « ${s.name} » ?`) && db.spots.delete(s.id!)} aria-label="Supprimer">🗑</button>
            </div>
          </div>
          {s.notes && <div className="warn small">{s.notes}</div>}
        </div>
      ))}
    </section>
  )
}
