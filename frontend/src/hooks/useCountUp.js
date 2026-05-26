import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from its previous value to `target` over `duration` ms
 * using requestAnimationFrame. Returns the current display value.
 */
export function useCountUp(target, duration = 400) {
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = target ?? 0
    if (from === to) return

    const startTime = performance.now()

    function tick(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (to - from) * eased
      setDisplay(Math.round(current))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        prevRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return display
}

/**
 * Same as useCountUp but formats as currency (₹ with commas).
 */
export function useCountUpCurrency(target, duration = 400) {
  const value = useCountUp(target, duration)
  return `₹${value.toLocaleString('en-IN')}`
}
