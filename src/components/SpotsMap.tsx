import { liveQuery } from 'dexie'
import type { Circle, CircleMarker, Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { DEPTH_STOPS, WMS_URL, depthAt, depthSld, describeDepth } from '../lib/bathy'
import { liveTrips } from '../lib/store'
import { SPOT_KINDS, kindEmoji, type Spot, type Trip } from '../lib/types'

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
  /** Marqueur posé à la position GPS (précision en mètres). */
  onMark: (lat: number, lon: number, accuracy: number) => void
  onEdit: (spot: Spot) => void
}

/**
 * Carte OpenStreetMap + balisage OpenSeaMap, avec option « Relief marin » (profondeurs EMODnet en couleurs).
 * Pastilles : vert = prises, bleu = sorties sans prise, gris = jamais pêché. Toucher la carte donne la profondeur ; appui long = nouveau spot.
 */
export function SpotsMap({ spots, onOpen, onAdd, onMark, onEdit }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap>(undefined)
  const layer = useRef<LayerGroup>(undefined)
  const bathy = useRef<TileLayer.WMS>(undefined)
  const [trips, setTrips] = useState<Trip[]>([])
  const [ready, setReady] = useState(false)
  const [relief, setRelief] = useState(true)
  const handlers = useRef({ onOpen, onAdd, onMark, onEdit })
  handlers.current = { onOpen, onAdd, onMark, onEdit }
  const watchId = useRef<number | undefined>(undefined)
  const dot = useRef<CircleMarker | undefined>(undefined)
  const halo = useRef<Circle | undefined>(undefined)
  const lastFix = useRef<GeolocationPosition | undefined>(undefined)
  const [tracking, setTracking] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [marking, setMarking] = useState(false)
  const [gpsError, setGpsError] = useState('')

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
      const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView([47.6, -3.15], 9)
      L.control.zoom({ position: 'topright' }).addTo(m)
      const attr = L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m)
      attr.getContainer()?.classList.add('attr-fold')
      attr.getContainer()?.addEventListener('click', () => attr.getContainer()?.classList.toggle('open'))
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
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
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
        const icon = L.divIcon({ className: '', html: s.pin ? `<div class="pin mark"><span>${kindEmoji(s.kind)}</span></div>` : `<div class="pin ${kind}"><span>${x?.catches ?? ''}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -38] })
        const marker = L.marker([s.lat, s.lon], { icon }).addTo(layer.current)
        const box = document.createElement('div')
        box.className = 'pop'
        const info = s.pin ? '' : x ? `${x.trips} sortie${x.trips > 1 ? 's' : ''} · ${x.catches} prise${x.catches > 1 ? 's' : ''}${x.species.length ? `<br><small>${esc(x.species.slice(0, 4).join(', '))}</small>` : ''}` : 'Pas encore de sortie ici'
        box.innerHTML = `<strong>${esc(s.name)}</strong>${s.kind ? `<br><small>${esc(SPOT_KINDS[s.kind])}</small>` : ''}<br>${info}<br><span class="depth">Profondeur : …</span>${s.notes ? `<br><small class="note">${esc(s.notes)}</small>` : ''}<br>`
        const open = document.createElement('button')
        open.textContent = 'Voir les prévisions'
        open.onclick = () => handlers.current.onOpen(s.id!)
        const edit = document.createElement('button')
        edit.className = 'alt'
        edit.textContent = 'Modifier / infos'
        edit.onclick = () => (map.current?.closePopup(), handlers.current.onEdit(s))
        const route = document.createElement('a')
        route.className = 'btnlink'
        route.textContent = 'Itinéraire'
        route.target = '_blank'
        route.rel = 'noopener'
        route.href = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`
        box.append(...(s.pin ? [edit, route] : [open, edit, route]))
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

  // Suivi GPS : point bleu + cercle de précision
  async function drawFix(p: GeolocationPosition, center: boolean) {
    const L = (await import('leaflet')).default
    const m = map.current
    if (!m) return
    const ll: [number, number] = [p.coords.latitude, p.coords.longitude]
    lastFix.current = p
    setAccuracy(Math.round(p.coords.accuracy))
    if (!dot.current) {
      halo.current = L.circle(ll, { radius: p.coords.accuracy, color: '#2f9bd8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(m)
      dot.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f7de1', fillOpacity: 1, interactive: false }).addTo(m)
    } else {
      halo.current?.setLatLng(ll).setRadius(p.coords.accuracy)
      dot.current.setLatLng(ll)
    }
    if (center) m.flyTo(ll, Math.max(m.getZoom(), 15), { duration: 0.8 })
  }

  function stopTracking() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = undefined
    dot.current?.remove()
    halo.current?.remove()
    dot.current = halo.current = undefined
    lastFix.current = undefined
    setTracking(false)
    setAccuracy(null)
  }

  function locate() {
    setGpsError('')
    if (!navigator.geolocation) return setGpsError('GPS indisponible sur cet appareil')
    if (tracking && lastFix.current) return void drawFix(lastFix.current, true) // déjà actif : on recentre
    let first = true
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        void drawFix(p, first)
        first = false
      },
      (e) => {
        setGpsError(e.code === 1 ? 'Autorise la localisation pour cette appli (Réglages iPhone → Confidentialité → Service de localisation).' : 'Position indisponible pour le moment')
        stopTracking()
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    setTracking(true)
  }

  /** Marque la position actuelle : on laisse le GPS s'affiner quelques secondes et on garde le meilleur point. */
  function markHere() {
    setGpsError('')
    if (!navigator.geolocation) return setGpsError('GPS indisponible sur cet appareil')
    setMarking(true)
    const started = Date.now()
    // Si le suivi GPS est déjà actif, son dernier point (récent) sert de départ.
    let best: GeolocationPosition | undefined = lastFix.current && Date.now() - lastFix.current.timestamp < 20000 ? lastFix.current : undefined
    let id: number | undefined
    const finish = () => {
      if (id != null) navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      setMarking(false)
      if (best) handlers.current.onMark(Number(best.coords.latitude.toFixed(5)), Number(best.coords.longitude.toFixed(5)), Math.round(best.coords.accuracy))
      else setGpsError('Position introuvable. Sors à découvert et réessaie.')
    }
    const timer = setTimeout(finish, 8000)
    id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p
        if (best.coords.accuracy <= 6 || (best.coords.accuracy <= 12 && Date.now() - started >= 3000)) finish()
      },
      (e) => {
        clearTimeout(timer)
        if (id != null) navigator.geolocation.clearWatch(id)
        setMarking(false)
        setGpsError(e.code === 1 ? 'Autorise la localisation pour cette appli (Réglages iPhone → Confidentialité → Service de localisation).' : 'Position indisponible pour le moment')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    )
  }

  return (
    <div className="mapwrap">
      <div ref={el} className="map" aria-label="Carte des spots" />
      <div className="gpsbtns">
        <button className={tracking ? 'on' : ''} onClick={locate} aria-label="Ma position GPS" title="Ma position">◎</button>
        <button onClick={markHere} disabled={marking} aria-label="Marquer ma position" title="Marquer ici (coin à homard, bon coin…)">{marking ? '…' : '📌'}</button>
      </div>
      {(tracking || gpsError || marking) && (
        <div className="gpsinfo" role="status">
          {gpsError ? gpsError : marking ? 'Recherche du GPS, ne bouge pas…' : <>Précision ± {accuracy ?? '…'} m · <button type="button" onClick={stopTracking}>Arrêter</button></>}
        </div>
      )}
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
