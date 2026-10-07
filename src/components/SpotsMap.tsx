import { liveQuery } from 'dexie'
import type { Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { DEPTH_STOPS, WMS_URL, depthAt, depthSld, describeDepth } from '../lib/bathy'
import { liveTrips } from '../lib/store'
import { SPOT_KINDS, type Spot, type Trip } from '../lib/types'

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

interface Props {
  spots: Spot[]
  onOpen: (id: number) => void
  onAdd: (lat: number, lon: number) => void
  onEdit: (spot: Spot) => void
}

/**
 * Carte OpenStreetMap + balisage OpenSeaMap, avec option « Relief marin » (profondeurs EMODnet en couleurs).
 * Pastilles : vert = prises, bleu = sorties sans prise, gris = jamais pêché. Toucher la carte donne la profondeur ; appui long = nouveau spot.
 */
export function SpotsMap({ spots, onOpen, onAdd, onEdit }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap>(undefined)
  const layer = useRef<LayerGroup>(undefined)
  const bathy = useRef<TileLayer.WMS>(undefined)
  const [trips, setTrips] = useState<Trip[]>([])
  const [ready, setReady] = useState(false)
  const [relief, setRelief] = useState(true)
  const handlers = useRef({ onOpen, onAdd, onEdit })
  handlers.current = { onOpen, onAdd, onEdit }

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
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap', className: 'osm-base' }).addTo(m)
      bathy.current = L.tileLayer.wms(WMS_URL, { layers: 'emodnet:mean', styles: '', format: 'image/png', transparent: true, version: '1.1.1', opacity: 0.85, attribution: '© EMODnet Bathymetry', ...({ sld_body: depthSld() } as object) })
      L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenSeaMap' }).addTo(m)
      layer.current = L.layerGroup().addTo(m)
      // Appui long : nouveau spot ici. Toucher la carte : profondeur à cet endroit.
      m.on('contextmenu', (e) => handlers.current.onAdd(e.latlng.lat, e.latlng.lng))
      m.on('click', async (e) => {
        const popup = L.popup({ closeButton: false }).setLatLng(e.latlng).setContent('Sondage…').openOn(m)
        const d = await depthAt(e.latlng.lat, e.latlng.lng)
        const box = document.createElement('div')
        box.className = 'pop'
        box.innerHTML = `<strong>Profondeur : ${esc(describeDepth(d))}</strong><br><small>au zéro des cartes (basse mer) · ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</small><br>`
        const b = document.createElement('button')
        b.textContent = 'Créer un spot ici'
        b.onclick = () => (m.closePopup(), handlers.current.onAdd(e.latlng.lat, e.latlng.lng))
        box.appendChild(b)
        popup.setContent(box)
      })
      map.current = m
      setReady(true)
    })()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = undefined
    }
  }, [])

  // Relief marin : calque de profondeurs au-dessus du plan, sous le balisage
  useEffect(() => {
    if (!ready || !map.current || !bathy.current) return
    if (relief) {
      bathy.current.addTo(map.current)
      bathy.current.setZIndex(5)
    } else bathy.current.remove()
  }, [ready, relief])

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
        const box = document.createElement('div')
        box.className = 'pop'
        const info = x ? `${x.trips} sortie${x.trips > 1 ? 's' : ''} · ${x.catches} prise${x.catches > 1 ? 's' : ''}${x.species.length ? `<br><small>${esc(x.species.slice(0, 4).join(', '))}</small>` : ''}` : 'Pas encore de sortie ici'
        box.innerHTML = `<strong>${esc(s.name)}</strong>${s.kind ? `<br><small>${esc(SPOT_KINDS[s.kind])}</small>` : ''}<br>${info}<br><span class="depth">Profondeur : …</span>${s.notes ? `<br><small class="note">${esc(s.notes)}</small>` : ''}<br>`
        const open = document.createElement('button')
        open.textContent = 'Voir les prévisions'
        open.onclick = () => handlers.current.onOpen(s.id!)
        const edit = document.createElement('button')
        edit.className = 'alt'
        edit.textContent = 'Modifier / infos'
        edit.onclick = () => (map.current?.closePopup(), handlers.current.onEdit(s))
        box.append(open, edit)
        marker.bindPopup(box, { closeButton: false })
        marker.on('popupopen', async () => {
          const d = await depthAt(s.lat, s.lon)
          const span = box.querySelector('.depth')
          if (span) span.textContent = `Profondeur : ${describeDepth(d)}`
        })
        bounds.push([s.lat, s.lon])
      }
      if (bounds.length && !(map.current as LeafletMap & { _fitted?: boolean })._fitted) {
        ;(map.current as LeafletMap & { _fitted?: boolean })._fitted = true
        map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, spots, trips])

  return (
    <div className="mapwrap">
      <div ref={el} className="map" aria-label="Carte des spots" />
      <div className="seg maplayers" role="group" aria-label="Fond de carte">
        <button className={!relief ? 'on' : ''} onClick={() => setRelief(false)}>Plan</button>
        <button className={relief ? 'on' : ''} onClick={() => setRelief(true)}>Relief marin</button>
      </div>
      {relief && (
        <div className="legend" aria-label="Légende des profondeurs en mètres">
          <div className="lg-title">Profondeur (m)</div>
          <div className="lg-bar">
            {DEPTH_STOPS.map((d) => (
              <span key={d.label} style={{ background: d.color }} title={d.label} />
            ))}
          </div>
          <div className="lg-nums">
            {DEPTH_STOPS.map((d, i) => (
              <span key={d.label}>{i === DEPTH_STOPS.length - 1 ? '200+' : d.max}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
