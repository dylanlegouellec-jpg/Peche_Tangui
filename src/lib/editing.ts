import { useEffect } from 'react'

// Formulaires ouverts (sortie, spot…) : tant qu'il y en a, une mise à jour de l'appli attend avant de recharger la page.
let open = 0
const waiting = new Set<() => void>()

export const isEditing = () => open > 0

/** Lance `cb` dès qu'aucun formulaire n'est ouvert (tout de suite s'il n'y en a pas). */
export function whenNotEditing(cb: () => void) {
  if (!open) cb()
  else waiting.add(cb)
}

/** À appeler dans un formulaire : la page ne sera pas rechargée tant qu'il est affiché. */
export function useEditing() {
  useEffect(() => {
    open++
    return () => {
      open = Math.max(0, open - 1)
      if (!open) {
        const list = [...waiting]
        waiting.clear()
        // Petit délai : laisse l'enregistrement en cours se terminer
        setTimeout(() => list.forEach((f) => f()), 800)
      }
    }
  }, [])
}
