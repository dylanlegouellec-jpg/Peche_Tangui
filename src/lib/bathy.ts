// Relief marin : EMODnet Bathymetry (données ouvertes, grille d'environ 115 m), sans clé. Profondeurs rapportées au zéro des cartes (basse mer).
export const WMS_URL = 'https://ows.emodnet-bathymetry.eu/wms'

/** Paliers de couleur des profondeurs (m). Chaque couleur vaut pour les fonds jusqu'à la profondeur indiquée. */
export const DEPTH_STOPS: { max: number; color: string; label: string }[] = [
  { max: 2, color: '#f2f9fd', label: '0-2 m' },
  { max: 5, color: '#cfe5f4', label: '2-5 m' },
  { max: 10, color: '#a6cfe8', label: '5-10 m' },
  { max: 20, color: '#78b3dc', label: '10-20 m' },
  { max: 30, color: '#4d93cb', label: '20-30 m' },
  { max: 50, color: '#2a73b5', label: '30-50 m' },
  { max: 100, color: '#14509a', label: '50-100 m' },
  { max: 200, color: '#0a357a', label: '100-200 m' },
  { max: 20000, color: '#06214f', label: '> 200 m' },
]

/** Style SLD qui colore la grille de profondeurs ; la terre (valeurs positives) reste transparente. */
export function depthSld(): string {
  const entries = [...DEPTH_STOPS].reverse().map((s, i, a) => {
    const upper = i === a.length - 1 ? 0 : -a[i + 1].max // borne haute de l'intervalle (valeur négative = sous l'eau)
    return `<ColorMapEntry color="${s.color}" quantity="${upper}"/>`
  })
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>emodnet:mean</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer>' +
    `<ColorMap type="intervals">${entries.join('')}<ColorMapEntry color="#ffffff" opacity="0" quantity="20000"/></ColorMap>` +
    '</RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  )
}

export interface Depth {
  /** Profondeur en m sous le zéro des cartes (positive) ; null si le point est à terre. */
  depth: number | null
  /** Altitude en m si le point est à terre. */
  altitude: number | null
}

const memo = new Map<string, Promise<Depth | null>>()

/** Profondeur (ou altitude) en un point, d'après la grille EMODnet. */
export function depthAt(lat: number, lon: number): Promise<Depth | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
  let p = memo.get(key)
  if (!p) {
    const d = 0.0005
    const url = `${WMS_URL}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=emodnet:mean&QUERY_LAYERS=emodnet:mean&STYLES=&SRS=EPSG:4326&BBOX=${lon - d},${lat - d},${lon + d},${lat + d}&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=application/json`
    p = fetch(url, { signal: AbortSignal.timeout(12000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { features?: { properties?: { Depth?: number } }[] }) => {
        const v = j.features?.[0]?.properties?.Depth
        if (typeof v !== 'number') return null
        return v < 0 ? { depth: -v, altitude: null } : { depth: null, altitude: v }
      })
      .catch((e) => {
        memo.delete(key)
        console.warn('Profondeur indisponible :', e)
        return null
      })
    memo.set(key, p)
  }
  return p
}

export const describeDepth = (d: Depth | null) => (d == null ? 'indisponible' : d.depth != null ? `${d.depth < 10 ? d.depth.toFixed(1) : Math.round(d.depth)} m` : `à terre (altitude ${Math.round(d.altitude ?? 0)} m)`)

/**
 * Cherche vers où un spot « regarde » la mer : on sonde 12 points à ~1,2 km autour (grille EMODnet : eau ou terre)
 * et on prend la direction moyenne de ceux qui sont en mer. Renvoie null si tout est mer (large) ou tout est terre.
 */
export async function detectFacing(lat: number, lon: number): Promise<{ facing: number; seaShare: number } | null> {
  const R = 1.2 // km
  const dirs = Array.from({ length: 12 }, (_, i) => i * 30)
  const pts = await Promise.all(
    dirs.map(async (b) => {
      const dLat = (R / 111) * Math.cos((b * Math.PI) / 180)
      const dLon = ((R / 111) * Math.sin((b * Math.PI) / 180)) / Math.cos((lat * Math.PI) / 180)
      const d = await depthAt(lat + dLat, lon + dLon)
      return d == null ? null : { bearing: b, sea: d.depth != null }
    }),
  )
  const known = pts.filter((p): p is { bearing: number; sea: boolean } => p != null)
  const sea = known.filter((p) => p.sea)
  if (known.length < 8 || sea.length === 0 || sea.length === known.length) return null
  const x = sea.reduce((n, p) => n + Math.sin((p.bearing * Math.PI) / 180), 0)
  const y = sea.reduce((n, p) => n + Math.cos((p.bearing * Math.PI) / 180), 0)
  return { facing: Math.round((((Math.atan2(x, y) * 180) / Math.PI) + 360) % 360), seaShare: sea.length / known.length }
}
