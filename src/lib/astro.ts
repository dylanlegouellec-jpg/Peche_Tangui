/** Lever et coucher du soleil (formule NOAA simplifiée, précision ~2 min) pour un jour AAAA-MM-JJ et un point. Renvoie des timestamps unix (s). */
export function sunTimes(key: string, lat: number, lon: number): { sunrise: number; sunset: number } | null {
  const [y, m, d] = key.split('-').map(Number)
  const rad = Math.PI / 180
  const julian = Math.floor(Date.UTC(y, m - 1, d, 12) / 86400000) + 2440587.5
  const n = Math.ceil(julian - 2451545.0 + 0.0008)
  const jStar = n - lon / 360
  const M = (357.5291 + 0.98560028 * jStar) % 360
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad)
  const lambda = (M + C + 180 + 102.9372) % 360
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad)
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.44 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec)
  if (cosH > 1 || cosH < -1) return null
  const H = Math.acos(cosH) / rad
  const unix = (j: number) => Math.round((j - 2440587.5) * 86400)
  return { sunrise: unix(transit - H / 360), sunset: unix(transit + H / 360) }
}

/** Timestamp unix (s) de midi UTC pour un jour AAAA-MM-JJ : sert de repère pour la lune et le coefficient. */
export const noonOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12) / 1000
}
