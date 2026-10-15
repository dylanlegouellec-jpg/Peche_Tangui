/** La lune avec sa vraie phase (0 = nouvelle, 0,5 = pleine), éclairée du bon côté vue de l'hémisphère nord. */
export function MoonIcon({ phase, size = 22 }: { phase: number; size?: number }) {
  const r = 10
  const p = ((phase % 1) + 1) % 1
  const k = Math.cos(2 * Math.PI * p) // 1 nouvelle, -1 pleine
  const waxing = p < 0.5
  // Limite ombre/lumière : demi-ellipse de largeur r·|k|
  const sweepOuter = waxing ? 1 : 0
  const sweepInner = k > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0
  const d = `M12 2 A${r} ${r} 0 0 ${sweepOuter} 12 22 A${Math.abs(k) * r} ${r} 0 0 ${sweepInner} 12 2z`
  return (
    <svg className="moon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="m-dark" />
      <path d={d} className="m-lit" />
    </svg>
  )
}
