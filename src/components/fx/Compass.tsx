import { compass } from '../../lib/exposure'
import { useLook } from '../../lib/look'

/**
 * Boussole : flèche du vent (vers où il souffle) et flèche de la houle, qui pivotent avec un effet ressort ;
 * des traînées défilent dans le sens du vent, d'autant plus vite qu'il est fort. `facing` = orientation du spot (côté mer).
 */
export function Compass({ windDir, wind, waveDir, wave, facing, label }: { windDir?: number | null; wind?: number | null; waveDir?: number | null; wave?: number | null; facing?: number; label: string }) {
  const { motion } = useLook()
  const windTo = windDir != null ? windDir + 180 : null
  const waveTo = waveDir != null ? waveDir + 180 : null
  const speed = Math.max(0.6, 3.2 - (wind ?? 0) / 15) // s par passage : plus de vent = plus rapide
  return (
    <div className={`compass ${motion === 'full' ? 'anim' : ''}`} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100">
        <circle className="c-ring" cx="50" cy="50" r="46" />
        {[0, 90, 180, 270].map((d) => (
          <text key={d} x={50 + Math.sin((d * Math.PI) / 180) * 37} y={53.5 + -Math.cos((d * Math.PI) / 180) * 37}>{compass(d)}</text>
        ))}
        {facing != null && <path className="c-sea" d={arc(facing)} />}
        {windTo != null && (
          <g className="c-streaks" style={{ transform: `rotate(${windTo}deg)`, ['--spd' as string]: `${speed}s` }}>
            {[-14, 0, 14].map((x, i) => <line key={x} x1={50 + x} y1="70" x2={50 + x} y2="58" style={{ animationDelay: `${i * 0.25}s` }} />)}
          </g>
        )}
        {waveTo != null && (
          <g className="c-arrow wave" style={{ transform: `rotate(${waveTo}deg)` }}>
            <path d="M50 74 V30 M42 38 L50 28 L58 38" />
          </g>
        )}
        {windTo != null && (
          <g className="c-arrow wind" style={{ transform: `rotate(${windTo}deg)` }}>
            <path d="M50 76 V26 M41 35 L50 23 L59 35" />
          </g>
        )}
        <circle className="c-hub" cx="50" cy="50" r="3.5" />
      </svg>
      <div className="c-legend small"><span className="lw">━ vent</span>{wave != null && <span className="lv">━ houle</span>}</div>
    </div>
  )
}

/** Secteur de 90° côté mer, sur le bord de la boussole. */
function arc(facing: number) {
  const p = (d: number) => [50 + Math.sin((d * Math.PI) / 180) * 46, 50 - Math.cos((d * Math.PI) / 180) * 46]
  const [x1, y1] = p(facing - 45)
  const [x2, y2] = p(facing + 45)
  return `M${x1} ${y1} A46 46 0 0 1 ${x2} ${y2}`
}
