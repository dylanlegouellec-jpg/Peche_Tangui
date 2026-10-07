import type { VercelRequest, VercelResponse } from '@vercel/node'

interface WindyWebcam {
  webcamId?: number | string
  title?: string
  status?: string
  images?: { current?: { icon?: string; thumbnail?: string; preview?: string } }
  location?: { city?: string; region?: string; latitude?: number; longitude?: number }
  urls?: { detail?: string }
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/**
 * GET ?lat=..&lon=.. : webcams publiques Windy proches d'un point (API Webcams v3, clé gratuite WINDY_WEBCAMS_KEY).
 * Sans clé : { configured: false }. Les adresses d'images contiennent un jeton qui expire (~10 min) : le client ne doit pas les garder longtemps.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.WINDY_WEBCAMS_KEY
  if (!key) return void res.json({ configured: false })
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  if (!(lat > 42 && lat < 52 && lon > -7 && lon < 3)) return void res.status(400).json({ error: 'Position hors zone' })
  try {
    // Rayon de 30 km, puis 60 km si rien de proche (Windy limite le rayon à 250 km)
    let list: WindyWebcam[] = []
    for (const radius of [30, 60]) {
      const url = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat.toFixed(4)},${lon.toFixed(4)},${radius}&include=images,location,urls&lang=fr&limit=10`
      const r = await fetch(url, { headers: { 'x-windy-api-key': key }, signal: AbortSignal.timeout(15000) })
      if (!r.ok) return void res.status(502).json({ configured: true, error: `Windy HTTP ${r.status}` })
      list = ((await r.json()) as { webcams?: WindyWebcam[] }).webcams ?? []
      if (list.length) break
    }
    const webcams = list
      .filter((w) => w.status !== 'inactive' && w.images?.current)
      .map((w) => ({
        id: String(w.webcamId),
        title: w.title ?? 'Webcam',
        city: w.location?.city,
        distanceKm: w.location?.latitude != null && w.location?.longitude != null ? Math.round(km(lat, lon, w.location.latitude, w.location.longitude)) : null,
        image: w.images?.current?.preview ?? w.images?.current?.thumbnail,
        detail: w.urls?.detail,
      }))
      .filter((w) => w.image)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
      .slice(0, 6)
    // Les jetons d'image expirent vite : cache court
    res.setHeader('Cache-Control', 'public, s-maxage=240')
    res.json({ configured: true, webcams })
  } catch {
    res.status(502).json({ configured: true, error: 'Webcams indisponibles' })
  }
}
