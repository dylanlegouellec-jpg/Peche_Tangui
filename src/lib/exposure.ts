/** Écart angulaire (0..180°) entre deux caps. */
export const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export const compass = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

export type WindKind = 'mer' | 'terre' | 'travers'

/**
 * Le vent vient-il de la mer, de la terre ou de côté ? `facing` = cap vers lequel le spot regarde la mer ;
 * `windFrom` = direction d'où vient le vent (convention météo).
 */
export function windKind(windFrom: number, facing: number): WindKind {
  const d = angleDiff(windFrom, facing)
  return d <= 60 ? 'mer' : d >= 120 ? 'terre' : 'travers'
}

export const WIND_LABEL: Record<WindKind, string> = { mer: 'vent de mer', terre: 'vent de terre', travers: 'vent de travers' }

/** Part de la houle qui arrive réellement sur le spot : 1 si exposé, jusqu'à 0,4 si la houle vient de la terre (spot abrité). */
export function swellFactor(waveFrom: number, facing: number): number {
  const d = angleDiff(waveFrom, facing) * (Math.PI / 180)
  return 0.4 + 0.6 * Math.max(0, Math.cos(d))
}
