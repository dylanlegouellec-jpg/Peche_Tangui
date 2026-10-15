import { useId } from 'react'
import { useLook } from '../../lib/look'
import { CountUp } from './CountUp'

/** Score dans un hublot qui se remplit d'eau jusqu'à son niveau ; la surface ondule. */
export function ScoreGauge({ value, tone }: { value: number; tone: 'good' | 'mid' | 'bad' }) {
  const { motion } = useLook()
  const id = useId().replace(/:/g, '')
  const level = 92 - (Math.max(0, Math.min(100, value)) / 100) * 84 // y de la surface (8 = plein, 92 = vide)
  const wave = 'M-100 0 q12.5 -6 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V120 H-100z'
  return (
    <div className={`gauge ${tone} ${motion === 'full' ? 'anim' : ''}`} role="img" aria-label={`Score ${value} sur 100`}>
      <svg viewBox="0 0 100 100">
        <defs>
          <clipPath id={`c${id}`}>
            <circle cx="50" cy="50" r="42" />
          </clipPath>
        </defs>
        <circle className="g-back" cx="50" cy="50" r="42" />
        <g clipPath={`url(#c${id})`}>
          <g className="g-fill" style={{ transform: `translateY(${level}px)` }}>
            <path className="g-wave w2" d={wave} />
            <path className="g-wave w1" d={wave} />
          </g>
        </g>
        <circle className="g-ring" cx="50" cy="50" r="46" pathLength={100} strokeDasharray={`${value} 100`} />
      </svg>
      <span className="g-num"><CountUp value={value} /></span>
    </div>
  )
}
