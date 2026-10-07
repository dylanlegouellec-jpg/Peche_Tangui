import type { VercelRequest, VercelResponse } from '@vercel/node'

const PHENOMENA: Record<string, string> = {
  '1': 'vent violent',
  '2': 'pluie-inondation',
  '3': 'orages',
  '4': 'crues',
  '5': 'neige-verglas',
  '6': 'canicule',
  '7': 'grand froid',
  '8': 'avalanches',
  '9': 'vagues-submersion',
}
const COLORS = ['', 'vert', 'jaune', 'orange', 'rouge']

interface Item {
  phenomenon_id?: string
  phenomenon_max_color_id?: number
}
interface Domain {
  domain_id?: string
  max_color_id?: number
  phenomenon_items?: Item[]
}
interface Period {
  echeance?: string
  timelaps?: { domain_ids?: Domain[] }
}

/**
 * GET ?dep=56 : vigilance météo officielle du jour et de demain pour un département (API Météo-France, clé gratuite).
 * La clé se met dans la variable d'environnement METEOFRANCE_API_KEY ; sans clé, la réponse est { configured: false }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.METEOFRANCE_API_KEY
  if (!key) return void res.json({ configured: false })
  const dep = String(req.query.dep ?? '56').replace(/\D/g, '').slice(0, 3) || '56'
  try {
    const r = await fetch('https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours', { headers: { apikey: key, accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) return void res.status(502).json({ configured: true, error: `Météo-France HTTP ${r.status}` })
    const j = (await r.json()) as { product?: { periods?: Period[] } }
    const days = (j.product?.periods ?? []).map((p) => {
      const d = p.timelaps?.domain_ids?.find((x) => x.domain_id === dep)
      const items = (d?.phenomenon_items ?? [])
        .filter((i) => (i.phenomenon_max_color_id ?? 1) >= 2)
        .map((i) => ({ phenomenon: PHENOMENA[i.phenomenon_id ?? ''] ?? `phénomène ${i.phenomenon_id}`, level: i.phenomenon_max_color_id ?? 2, color: COLORS[i.phenomenon_max_color_id ?? 2] }))
      return { when: p.echeance === 'J1' ? 'demain' : "aujourd'hui", level: d?.max_color_id ?? 1, color: COLORS[d?.max_color_id ?? 1], items }
    })
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
    res.json({ configured: true, dep, days })
  } catch {
    res.status(502).json({ configured: true, error: 'Vigilance indisponible' })
  }
}
