import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * GET ?lat=..&lon=.. : dernière chlorophylle satellite (VIIRS, NOAA CoastWatch, gratuit) autour d'un point.
 * Le serveur NOAA n'autorise pas les appels directs depuis un navigateur : on passe par cette petite passerelle.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  // Façades Manche-Atlantique seulement : évite d'en faire un relais ouvert
  if (!(lat > 42 && lat < 52 && lon > -7 && lon < 3)) return void res.status(400).json({ error: 'Position hors zone' })
  const d = 0.06
  const q = `chlor_a[(last-9):1:(last)][(0.0)][(${(lat - d).toFixed(3)}):1:(${(lat + d).toFixed(3)})][(${(lon - d).toFixed(3)}):1:(${(lon + d).toFixed(3)})]`
  try {
    const r = await fetch(`https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPVIIRSchlaDaily.csv?${encodeURIComponent(q).replace(/%3A/g, ':').replace(/%2C/g, ',')}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) return void res.status(502).json({ error: 'Données satellite indisponibles' })
    const lines = (await r.text()).split('\n').slice(2).filter(Boolean)
    const byDay = new Map<string, number[]>()
    for (const l of lines) {
      const [t, , , , v] = l.split(',')
      const x = Number(v)
      if (!Number.isFinite(x) || x <= 0) continue // NaN = nuages
      byDay.set(t, [...(byDay.get(t) ?? []), x])
    }
    const days = [...byDay.keys()].sort()
    const last = days[days.length - 1]
    // Cache 3 h côté Vercel : les compositions journalières ne changent qu'une fois par jour
    res.setHeader('Cache-Control', 'public, s-maxage=10800, stale-while-revalidate=86400')
    if (!last) return void res.json({ value: null })
    const vals = byDay.get(last)!.sort((a, b) => a - b)
    res.json({ value: Number(vals[Math.floor(vals.length / 2)].toFixed(2)), date: last, pixels: vals.length })
  } catch {
    res.status(502).json({ error: 'Données satellite indisponibles' })
  }
}
