export interface Webcam {
  id: string
  title: string
  city?: string
  distanceKm: number | null
  image: string
  detail?: string
}

const cache = new Map<string, { at: number; list: Webcam[] }>()

/** Webcams publiques Windy proches d'un point. Liste vide si la clé n'est pas configurée ou si le service ne répond pas. Gardée 4 min (les adresses d'images expirent). */
export async function fetchWebcams(lat: number, lon: number): Promise<Webcam[]> {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < 4 * 60 * 1000) return hit.list
  try {
    const r = await fetch(`/api/webcams?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) return []
    const j = (await r.json()) as { configured?: boolean; webcams?: Webcam[] }
    const list = j.configured ? j.webcams ?? [] : []
    cache.set(k, { at: Date.now(), list })
    return list
  } catch (e) {
    console.warn('Webcams indisponibles :', e)
    return []
  }
}
