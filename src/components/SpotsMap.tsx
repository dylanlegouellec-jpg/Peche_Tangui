import { liveQuery } from 'dexie'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { liveTrips } from '../lib/store'
import type { Spot, Trip } from '../lib/types'

export interface SpotSummary {
  trips: number
  catches: number
  species: string[]
}

export function summarize(trips: Trip[]): Map<string, SpotSummary> {
  const m = new Map<string, SpotSummary>()
  for (const t of trips) {
    const s = m.get(t.spotUid) ?? { trips: 0, catches: 0, species: [] }
    s.trips++
    s.catches += t.catches.length
    for (const c of t.catches) if (c.species && !s.species.includes(c.species)) s.species.push(c.species)
    m.set(t.spotUid, s)
  }
  return m
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Carte OpenStreetMap (+ balisage maritime OpenSeaMap) avec les spots : vert = prises, bleu = sorties sans prise, gris = jamais pêché. */
export function SpotsMap({ spots, onOpen, onAdd }: { spots: Spot[]; onOpen: (id: number) => void; onAdd: (lat: number, lon: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap>(undefined)
  const layer = useRef<LayerGroup>(undefined)
  const [trips, setTrips] = useState<Trip[]>([])
  const [ready, setReady] = useState(false)
  const handlers = useRef({ onOpen, onAdd })
  handlers.current = { onOpen, onAdd }

  useEffect(() => {
    const sub = liveQuery(liveTrips).subscribe(setTrips)
    return () => sub.unsubscribe()
  }, [])

  // Création de la carte (Leaflet chargé à la demande pour ne pas alourdir l'appli)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !el.current) return
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([47.6, -3.15], 9)
      L.control.zoom({ position: 'topright' }).addTo(m)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m)
      L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenSeaMap' }).addTo(m)
      layer.current = L.layerGroup().addTo(m)
      // Appui long sur la carte : ajouter un spot à cet endroit
      m.on('contextmenu', (e) => handlers.current.onAdd(e.latlng.lat, e.latlng.lng))
      map.current = m
      setReady(true)
    })()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = undefined
    }
  }, [])

  // Marqueurs
  useEffect(() => {
    if (!ready || !map.current || !layer.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !layer.current || !map.current) return
      layer.current.clearLayers()
      const sum = summarize(trips)
      const bounds: [number, number][] = []
      for (const s of spots) {
        const x = sum.get(s.uid)
        const kind = x && x.catches ? 'good' : x ? 'mid' : 'none'
        const icon = L.divIcon({ className: '', html: `<div class="pin ${kind}"><span>${x?.catches ?? ''}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -38] })
        const marker = L.marker([s.lat, s.lon], { icon }).addTo(layer.current)
        const info = x ? `${x.trips} sortie${x.trips > 1 ? 's' : ''} · ${x.catches} prise${x.catches > 1 ? 's' : ''}${x.species.length ? `<br><small>${esc(x.species.slice(0, 4).join(', '))}</small>` : ''}` : 'Pas encore de sortie ici'
        const box = document.createElement('div')
        box.className = 'pop'
        box.innerHTML = `<strong>${esc(s.name)}</strong><br>${info}<br>`
        const btn = document.createElement('button')
        btn.textContent = 'Voir les prévisions'
        btn.onclick = () => handlers.current.onOpen(s.id!)
        box.appendChild(btn)
        marker.bindPopup(box, { closeButton: false })
        bounds.push([s.lat, s.lon])
      }
      if (bounds.length) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
    })()
    return () => {
      cancelled = true
    }
  }, [ready, spots, trips])

  return <div ref={el} className="map" aria-label="Carte des spots" />
}
