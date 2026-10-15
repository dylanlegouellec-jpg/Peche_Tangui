import { useEffect, useRef, useState } from 'react'
import { useLook } from '../../lib/look'

/** Nombre qui défile jusqu'à sa valeur (et d'une valeur à l'autre). */
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const { motion } = useLook()
  const [shown, setShown] = useState(motion === 'off' ? value : 0)
  const from = useRef(motion === 'off' ? value : 0)
  useEffect(() => {
    if (motion === 'off') return setShown(value)
    const start = performance.now()
    const a = from.current
    let id = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      const v = a + (value - a) * e
      setShown(v)
      from.current = v
      if (k < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [value, motion, duration])
  return <>{shown.toFixed(decimals)}</>
}
