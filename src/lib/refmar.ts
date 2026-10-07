// Niveaux d'eau réellement mesurés par les marégraphes du SHOM (réseau REFMAR) : données ouvertes (Etalab), sans clé.
// https://services.data.shom.fr (catalogue : OBSERVATION_NIVEAU_MER_REFMAR_RONIM)

export interface Observation {
  ts: number // unix s
  level: number // m, même référence que les prédictions (zéro hydrographique)
}

const cache = new Map<number, { at: number; rows: Observation[] }>()
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z'

/** Mesures des dernières `hours` heures (un point toutes les ~10 min). Résultat gardé 5 min. */
export async function fetchObservations(refmarId: number, hours = 14): Promise<Observation[]> {
  const hit = cache.get(refmarId)
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.rows
  const end = Date.now()
  const url = `https://services.data.shom.fr/maregraphie/observation/json/${refmarId}?sources=1&dtStart=${iso(end - hours * 3600e3)}&dtEnd=${iso(end + 3600e3)}`
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`REFMAR HTTP ${r.status}`)
  const j = (await r.json()) as { data?: { value: number | null; timestamp: string }[] }
  const all = (j.data ?? []).filter((d) => d.value != null)
  const rows = all
    .filter((_, i) => i % 10 === 0 || i === all.length - 1) // un point sur dix, et toujours le plus récent
    .map((d) => ({ ts: Date.parse(d.timestamp.replace(/\//g, '-').replace(' ', 'T') + 'Z') / 1000, level: d.value as number }))
  cache.set(refmarId, { at: Date.now(), rows })
  return rows
}
