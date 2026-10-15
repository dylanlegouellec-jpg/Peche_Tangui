import { useEffect, useRef } from 'react'
import { getAmbience, useAmbience, type Ambience } from '../../lib/ambience'
import { loop, useLook } from '../../lib/look'

/** Fond de l'appli selon le style choisi : la mer du spot (océan), un dégradé vivant (verre) ou une carte marine (carnet). */
export function Backdrop() {
  const { look, motion, fx, dark } = useLook()
  const animate = motion === 'full' && fx.background
  if (look === 'glass') return <div className={`backdrop glass-mesh ${animate ? 'anim' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>
  if (look === 'logbook') return <div className="backdrop chart-bg" aria-hidden="true"><Rose /></div>
  return <OceanCanvas animate={animate} dark={dark} />
}

/** Rose des vents en filigrane (style carnet). */
function Rose() {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8
    const r = i % 4 === 0 ? 46 : i % 2 === 0 ? 30 : 20
    return `${50 + Math.sin(a) * r},${50 - Math.cos(a) * r} ${50 + Math.sin(a + Math.PI / 16) * 6},${50 - Math.cos(a + Math.PI / 16) * 6}`
  }).join(' ')
  return (
    <svg className="rose" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" />
      <circle cx="50" cy="50" r="40" />
      <polygon points={pts} />
      <text x="50" y="7">N</text>
    </svg>
  )
}

type Palette = { sky: [string, string]; sea: [string, string]; foam: string; glow: string | null }
const PALETTES: Record<'light' | 'dark', Record<Ambience['phase'], Palette>> = {
  light: {
    dawn: { sky: ['#f7c9ae', '#fbe8d8'], sea: ['#7aa8c9', '#3f78a3'], foam: 'rgba(255,255,255,.55)', glow: '#ffd2a8' },
    day: { sky: ['#bfe0f5', '#eef5fa'], sea: ['#6fb0d6', '#2f7bae'], foam: 'rgba(255,255,255,.6)', glow: '#fff6d8' },
    dusk: { sky: ['#f2a785', '#f8d8c0'], sea: ['#5f86ad', '#2c5b85'], foam: 'rgba(255,240,230,.5)', glow: '#ffb98c' },
    // Thème clair : nuit adoucie pour que les textes sombres restent lisibles
    night: { sky: ['#a9bdd3', '#dde7f0'], sea: ['#6a8fb0', '#35607f'], foam: 'rgba(230,240,255,.5)', glow: '#f4f7ff' },
  },
  dark: {
    dawn: { sky: ['#2a2238', '#0b1f2e'], sea: ['#173b57', '#0a2235'], foam: 'rgba(255,200,170,.25)', glow: '#f2a07a' },
    day: { sky: ['#123a57', '#0b1f2e'], sea: ['#15466a', '#0a2840'], foam: 'rgba(200,230,255,.28)', glow: '#9fd0ff' },
    dusk: { sky: ['#3a2440', '#0b1f2e'], sea: ['#183a58', '#0a2235'], foam: 'rgba(255,190,160,.25)', glow: '#e88a68' },
    night: { sky: ['#050d16', '#0b1f2e'], sea: ['#0b2940', '#04121e'], foam: 'rgba(120,200,255,.22)', glow: '#cfe0ff' },
  },
}

const rad = (d: number) => (d * Math.PI) / 180

/**
 * La mer du spot, dessinée en direct : hauteur, vitesse et sens des vagues suivent la houle prévue,
 * des traînées suivent le vent, la pluie tombe s'il pleut, ciel et couleurs suivent l'heure (aube, jour, crépuscule, nuit).
 */
function OceanCanvas({ animate, dark }: { animate: boolean; dark: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const amb = useAmbience()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    // Particules fixées une fois : étoiles, traînées de vent, gouttes
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rnd(0.4, 1.4), p: rnd(0, 6) }))
    const streaks = Array.from({ length: 40 }, () => ({ x: Math.random(), y: rnd(0.05, 0.6), l: rnd(20, 60), s: rnd(0.6, 1.4) }))
    const drops = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(0.8, 1.3) }))

    const draw = (tms: number) => {
      const a = getAmbience()
      const pal = PALETTES[dark ? 'dark' : 'light'][a.phase]
      const t = tms / 1000
      const horizon = h * 0.62
      // Ciel
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, pal.sky[0])
      sky.addColorStop(1, pal.sky[1])
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      // Soleil ou lune, voilé par les nuages
      if (pal.glow) {
        const gx = w * 0.82
        const gy = a.phase === 'day' ? h * 0.14 : horizon - h * 0.08
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, h * 0.22)
        g.addColorStop(0, pal.glow)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalAlpha = 0.55 * (1 - a.cloud / 160)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, horizon)
        ctx.globalAlpha = 1
      }
      // Étoiles la nuit (scintillent)
      if (a.phase === 'night' && a.cloud < 85) {
        ctx.fillStyle = '#fff'
        for (const s of stars) {
          ctx.globalAlpha = (0.35 + 0.35 * Math.sin(t * 1.3 + s.p)) * (1 - a.cloud / 100)
          ctx.beginPath()
          ctx.arc(s.x * w, s.y * horizon, s.r, 0, 7)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      // Vent : traînées qui vont vers où souffle le vent, d'autant plus nombreuses et rapides qu'il est fort
      const toward = rad((a.windDir ?? 270) + 180)
      const wx = Math.sin(toward)
      const wy = -Math.cos(toward) * 0.25
      const nStreaks = Math.min(streaks.length, Math.round(a.wind / 1.5))
      ctx.strokeStyle = dark ? 'rgba(200,225,255,.18)' : 'rgba(255,255,255,.55)'
      ctx.lineWidth = 1.2
      for (let i = 0; i < nStreaks; i++) {
        const s = streaks[i]
        const v = (a.wind / 3.6) * 9 * s.s
        const x = (((s.x * w + wx * v * t) % (w + 120)) + w + 120) % (w + 120) - 60
        const y = s.y * horizon + wy * v * t * 0.2
        ctx.beginPath()
        ctx.moveTo(x, ((y % horizon) + horizon) % horizon)
        ctx.lineTo(x - wx * s.l, ((y % horizon) + horizon) % horizon - wy * s.l)
        ctx.stroke()
      }
      // Mer : 4 couches de vagues, de l'horizon vers le bas ; amplitude d'après la houle, sens d'après sa direction
      const sx = Math.sin(rad((a.waveDir ?? 270) + 180)) >= 0 ? 1 : -1
      const amp = 3 + Math.min(a.wave, 4) * 7
      const speed = 0.6 + 6 / Math.max(4, a.period ?? 8)
      for (let layer = 0; layer < 4; layer++) {
        const base = horizon + layer * (h - horizon) * 0.22
        const k = (2 * Math.PI) / (w * (0.55 - layer * 0.08))
        const A = amp * (0.45 + layer * 0.22)
        const sea = ctx.createLinearGradient(0, base - A, 0, h)
        sea.addColorStop(0, pal.sea[0])
        sea.addColorStop(1, pal.sea[1])
        ctx.globalAlpha = 0.55 + layer * 0.15
        ctx.fillStyle = sea
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w + 8; x += 8) {
          const ph = k * x - sx * speed * t * (1 + layer * 0.35) + layer * 1.7
          ctx.lineTo(x, base + A * Math.sin(ph) + A * 0.35 * Math.sin(2.3 * ph + t * 0.7))
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()
        // Écume sur les crêtes quand il y a de la houle
        if (a.wave > 0.8 && layer > 0) {
          ctx.strokeStyle = pal.foam
          ctx.lineWidth = 1.5
          ctx.beginPath()
          for (let x = 0; x <= w + 8; x += 8) {
            const ph = k * x - sx * speed * t * (1 + layer * 0.35) + layer * 1.7
            const y = base + A * Math.sin(ph) + A * 0.35 * Math.sin(2.3 * ph + t * 0.7)
            if (Math.sin(ph) < -0.6) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // Pluie, inclinée par le vent
      if (a.rain > 0.1) {
        const n = Math.min(drops.length, Math.round(20 + a.rain * 30))
        ctx.strokeStyle = dark ? 'rgba(170,200,230,.35)' : 'rgba(60,90,120,.3)'
        ctx.lineWidth = 1
        for (let i = 0; i < n; i++) {
          const d = drops[i]
          const y = ((d.y * h + t * 420 * d.s) % h)
          const x = ((d.x * w + y * wx * 0.3) % w + w) % w
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + wx * 4, y + 12)
          ctx.stroke()
        }
      }
    }

    let stop = () => {}
    if (animate) stop = loop(draw, 30)
    else draw(0)
    const onResize = () => !animate && draw(0)
    window.addEventListener('resize', onResize)
    return () => {
      stop()
      window.removeEventListener('resize', resize)
      window.removeEventListener('resize', onResize)
    }
    // Les conditions changent : en mode statique on redessine
  }, [animate, dark, animate ? 0 : amb])

  return <canvas ref={ref} className="backdrop ocean" aria-hidden="true" />
}
