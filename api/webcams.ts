import type { VercelRequest, VercelResponse } from '@vercel/node'

interface WindyWebcam {
  webcamId?: number | string
  title?: string
  status?: string
  images?: { current?: { icon?: string; thumbnail?: string; preview?: string } }
  location?: { city?: string; region?: string; latitude?: number; longitude?: number }
  urls?: { detail?: string }
}

/** Réponses récentes gardées en mémoire par le serveur (les jetons d'image Windy expirent en ~10 min). */
const memo = new Map<string, { at: number; body: unknown }>()

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/**
 * GET ?lat=..&lon=.. : webcams publiques Windy proches d'un point (API Webcams v3, clé gratuite WINDY_WEBCAMS_KEY).
 *   &all=1        : liste élargie (jusqu'à 80 km, 40 webcams) pour choisir celles d'un spot
 *   &ids=1,2,3    : seulement ces webcams, dans cet ordre (choix fait par l'utilisateur)
 * Sans clé : { configured: false }. Les adresses d'images contiennent un jeton qui expire (~10 min) : le client ne doit pas les garder longtemps.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.WINDY_WEBCAMS_KEY
  if (!key) return void res.json({ configured: false })
  // Position arrondie à ~2 km : les webcams proches sont les mêmes, et on ménage le quota Windy
  const lat = Math.round(Number(req.query.lat) * 50) / 50
  const lon = Math.round(Number(req.query.lon) * 50) / 50
  if (!(lat > 42 && lat < 52 && lon > -7 && lon < 3)) return void res.status(400).json({ error: 'Position hors zone' })
  const ids = String(req.query.ids ?? '')
  if (ids && !/^\d{1,12}(,\d{1,12}){0,11}$/.test(ids)) return void res.status(400).json({ error: 'Liste de webcams invalide' })
  const all = req.query.all === '1'
  const k = `${lat},${lon},${ids || (all ? 'all' : '')}`
  const hit = memo.get(k)
  if (hit && Date.now() - hit.at < 4 * 60e3) {
    res.setHeader('Cache-Control', 'public, s-maxage=240')
    return void res.json(hit.body)
  }
  try {
    // Rayon de 30 km, puis 60 km si rien de proche (Windy limite le rayon à 250 km)
    let list: WindyWebcam[] = []
    const base = 'https://api.windy.com/webcams/api/v3/webcams?include=images,location,urls&lang=fr'
    if (ids) {
      // Webcams choisies : une requête par webcam (méthode documentée par Windy), en parallèle
      const one = async (id: string) => {
        const r = await fetch(`https://api.windy.com/webcams/api/v3/webcams/${id}?include=images,location,urls&lang=fr`, { headers: { 'x-windy-api-key': key }, signal: AbortSignal.timeout(15000) })
        return r.ok ? ((await r.json()) as WindyWebcam) : null
      }
      list = (await Promise.all(ids.split(',').map((id) => one(id).catch(() => null)))).filter((w): w is WindyWebcam => !!w)
    }
    const urls = ids ? [] : all ? [`${base}&nearby=${lat.toFixed(4)},${lon.toFixed(4)},80&limit=50`] : [30, 60].map((radius) => `${base}&nearby=${lat.toFixed(4)},${lon.toFixed(4)},${radius}&limit=10`)
    for (const url of urls) {
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
    // Ordre choisi par l'utilisateur, sinon les plus proches d'abord
    if (ids) {
      const order = ids.split(',')
      webcams.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    } else webcams.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)).splice(all ? 40 : 6)
    // Les jetons d'image expirent vite : cache court
    res.setHeader('Cache-Control', 'public, s-maxage=240')
    const body = { configured: true, webcams }
    memo.set(k, { at: Date.now(), body })
    res.json(body)
  } catch {
    res.status(502).json({ configured: true, error: 'Webcams indisponibles' })
  }
}
