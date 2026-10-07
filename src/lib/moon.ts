const rad = Math.PI / 180

/**
 * Phase lunaire 0..1 (0 = nouvelle lune, 0.5 = pleine lune), d'après l'élongation Lune-Soleil
 * (série de Meeus tronquée : précision de l'ordre de 2 h, contre ±14 h avec une lunaison moyenne).
 */
export function moonPhase(ts: number): number {
  const T = (ts / 86400 + 2440587.5 - 2451545.0) / 36525
  const D = 297.8501921 + 445267.1114034 * T
  const M = 357.5291092 + 35999.0502909 * T
  const Mp = 134.9633964 + 477198.8675055 * T
  const s = (deg: number) => Math.sin(deg * rad)
  const elongation = D + 6.289 * s(Mp) + 1.274 * s(2 * D - Mp) + 0.658 * s(2 * D) + 0.214 * s(2 * Mp) - 0.186 * s(M) - 1.915 * s(M) - 0.02 * s(2 * M)
  return (((elongation / 360) % 1) + 1) % 1
}

/** Pourcentage de disque lunaire éclairé. */
export const moonIllumination = (ts: number) => Math.round(((1 - Math.cos(2 * Math.PI * moonPhase(ts))) / 2) * 100)

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
