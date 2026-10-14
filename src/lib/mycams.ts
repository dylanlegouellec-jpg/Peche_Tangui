import type { MyCam } from './types'

export type CamKind = { kind: 'image'; src: string } | { kind: 'youtube'; src: string } | { kind: 'link' }

/** Reconnaît le type de webcam d'après son adresse : image fixe rafraîchie, direct YouTube (intégré), ou simple page web (ouverte à part). */
export function camKind(url: string): CamKind {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { kind: 'link' }
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  let yt: string | null = null
  if (host === 'youtu.be') yt = u.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') yt = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]+)/)?.[1] ?? null
  if (yt && /^[\w-]{6,}$/.test(yt)) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?mute=1&playsinline=1` }
  if (/\.(jpe?g|png|webp|gif)$/i.test(u.pathname) || /snapshot|image\.cgi|cam\.jpg/i.test(u.pathname + u.search)) return { kind: 'image', src: url }
  return { kind: 'link' }
}

/** Vérifie une adresse saisie : renvoie un message d'erreur, ou null si elle est utilisable. */
export function checkCamUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return 'Adresse invalide : colle le lien complet, commençant par https://'
  }
  if (u.protocol !== 'https:') return 'L’adresse doit commencer par https:// (les liens http ne s’affichent pas dans l’appli)'
  return null
}

export const camLabel: Record<CamKind['kind'], string> = { image: 'Image en direct', youtube: 'Direct YouTube', link: 'Page web' }

export type { MyCam }
