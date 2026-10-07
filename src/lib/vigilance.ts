export interface VigilanceDay {
  when: string
  level: number // 1 vert, 2 jaune, 3 orange, 4 rouge
  color: string
  items: { phenomenon: string; level: number; color: string }[]
}

/** Vigilance Météo-France du département. Renvoie [] si la clé n'est pas configurée côté serveur ou si le service ne répond pas. */
export async function fetchVigilance(dep = '56'): Promise<VigilanceDay[]> {
  try {
    const r = await fetch(`/api/vigilance?dep=${dep}`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return []
    const j = (await r.json()) as { configured?: boolean; days?: VigilanceDay[] }
    return j.configured ? j.days ?? [] : []
  } catch (e) {
    console.warn('Vigilance indisponible :', e)
    return []
  }
}
