export type Level = 'log' | 'info' | 'warn' | 'error' | 'debug'
export interface LogEntry {
  t: number
  level: Level
  msg: string
}

const MAX = 400
const buffer: LogEntry[] = []
const listeners = new Set<() => void>()
let version = 0

const fmt = (a: unknown) => {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}`
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function push(level: Level, msg: string) {
  buffer.push({ t: Date.now(), level, msg })
  if (buffer.length > MAX) buffer.shift()
  version++
  listeners.forEach((l) => l())
}

/** Capte console.*, les erreurs JavaScript et les promesses rejetées, pour le panneau de diagnostic. */
export function installDiagnostics() {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as Level[]) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      push(level, args.map(fmt).join(' '))
      original(...args)
    }
  }
  window.addEventListener('error', (e) => push('error', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => push('error', `Promesse rejetée : ${fmt(e.reason)}`))
  push('info', 'Diagnostic démarré')
}

export const getLogs = () => buffer
export const logVersion = () => version
export const clearLogs = () => {
  buffer.length = 0
  version++
  listeners.forEach((l) => l())
}
export const subscribeLogs = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
