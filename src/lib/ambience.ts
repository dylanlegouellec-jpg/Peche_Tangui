import { useSyncExternalStore } from 'react'

/** Conditions affichées en ce moment (spot et heure choisis) : elles pilotent le fond animé. */
export interface Ambience {
  wave: number // m
  waveDir: number | null // ° d'où vient la houle
  period: number | null // s
  wind: number // km/h
  windDir: number | null // ° d'où vient le vent
  rain: number // mm/h
  cloud: number // %
  phase: 'dawn' | 'day' | 'dusk' | 'night'
}

let state: Ambience = { wave: 0.6, waveDir: 270, period: 8, wind: 12, windDir: 270, rain: 0, cloud: 30, phase: phaseNow() }
const listeners = new Set<() => void>()

function phaseNow(): Ambience['phase'] {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' })) % 24
  return h < 6 || h >= 22 ? 'night' : h < 9 ? 'dawn' : h >= 19 ? 'dusk' : 'day'
}

export function setAmbience(p: Partial<Ambience>) {
  const next = { ...state, ...p }
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  listeners.forEach((l) => l())
}
export const getAmbience = () => state
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const useAmbience = () => useSyncExternalStore(subscribe, getAmbience)
