// Chlorophylle de surface par satellite (VIIRS, NOAA CoastWatch, gratuit) : un repère de la « couleur » de l'eau.
// Plus il y en a, plus l'eau est verte et chargée, donc moins claire pour la plongée. Mesure du jour, avec des trous quand il y a des nuages.
export interface Chlorophyll {
  value: number // mg/m³
  date: string
  ageDays: number
}

const KEY = 'peche-chl'

interface Stored {
  at: number
  data: Chlorophyll | null
}

const read = (): Record<string, Stored> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Dernière valeur autour du spot (cache 6 h). `null` si le ciel était couvert partout depuis 10 jours ou si le service ne répond pas. */
export async function fetchChlorophyll(lat: number, lon: number): Promise<Chlorophyll | null> {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const store = read()
  const hit = store[k]
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.data
  try {
    const r = await fetch(`/api/chl?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(25000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = (await r.json()) as { value: number | null; date?: string }
    const data = j.value != null && j.date ? { value: j.value, date: j.date, ageDays: Math.max(0, Math.round((Date.now() - Date.parse(j.date)) / 86400e3)) } : null
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...store, [k]: { at: Date.now(), data } }))
    } catch {
      /* stockage plein ou indisponible */
    }
    return data
  } catch (e) {
    console.warn('Chlorophylle indisponible :', e)
    return hit?.data ?? null
  }
}

export function waterLook(v: number): string {
  return v <= 1.5 ? 'eau claire' : v <= 4 ? 'eau légèrement chargée' : v <= 8 ? 'eau verte' : 'eau très chargée'
}
