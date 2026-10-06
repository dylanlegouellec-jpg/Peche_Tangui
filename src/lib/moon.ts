const SYNODIC = 29.530588853
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 1000

/** Phase lunaire 0..1 (0 = nouvelle lune, 0.5 = pleine lune). */
export function moonPhase(ts: number): number {
  const days = (ts - NEW_MOON_REF) / 86400
  return (((days / SYNODIC) % 1) + 1) % 1
}

/** Coefficient de marée estimé (20..120), grandes marées ~1,5 j après nouvelle/pleine lune. */
export function estimatedCoef(ts: number): number {
  const p = moonPhase(ts)
  return Math.round(70 + 45 * Math.cos(4 * Math.PI * (p - 0.05)))
}

export function moonLabel(ts: number): string {
  const p = moonPhase(ts)
  if (p < 0.03 || p > 0.97) return 'Nouvelle lune'
  if (p < 0.22) return 'Premier croissant'
  if (p < 0.28) return 'Premier quartier'
  if (p < 0.47) return 'Gibbeuse croissante'
  if (p < 0.53) return 'Pleine lune'
  if (p < 0.72) return 'Gibbeuse décroissante'
  if (p < 0.78) return 'Dernier quartier'
  return 'Dernier croissant'
}
