import { useState } from 'react'
import { db } from '../lib/db'
import type { Spot } from '../lib/types'

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

  function here() {
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`),
      () => setError('Position indisponible'),
    )
  }

  return (
    <section>
      <form className="card" onSubmit={add}>
        <h3>Ajouter un spot</h3>
        <input placeholder="Nom du coin" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Latitude, longitude (ex : 47.48, -3.12)" value={coords} onChange={(e) => setCoords(e.target.value)} inputMode="decimal" />
        <div className="row">
          <button type="button" onClick={here}>
            📍 Ma position
          </button>
          <button className="primary">Ajouter</button>
        </div>
        {error && <p className="warn small">{error}</p>}
        <p className="muted small">Tes spots restent privés, stockés uniquement sur ce téléphone.</p>
      </form>
      {spots.map((s) => (
        <div className="card row between" key={s.id}>
          <div>
            <strong>{s.name}</strong> {s.example && <span className="tag">exemple</span>}
            <div className="muted small">
              {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
            </div>
          </div>
          <button onClick={() => confirm(`Supprimer « ${s.name} » ?`) && db.spots.delete(s.id!)}>🗑</button>
        </div>
      ))}
    </section>
  )
}
