import type { Mode } from './types'

export interface Species {
  name: string
  modes: Mode[]
  /** Intérêt par mois (janvier → décembre), 0 = absent, 3 = pic de saison. Valeurs indicatives. */
  months: number[]
  minSizeCm?: number
  tip: string
}

// Données de départ indicatives pour le Morbihan : à affiner avec l'expérience du terrain
// et à vérifier avec la réglementation en vigueur (tailles minimales, quotas, restrictions bar).
export const SPECIES: Species[] = [
  { name: 'Bar', modes: ['bord', 'plongee'], months: [0, 0, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1], minSizeCm: 42, tip: 'Eau en mouvement, aube/crépuscule, mer un peu remuée. Réglementation bar très stricte : vérifier avant chaque saison.' },
  { name: 'Lieu jaune', modes: ['bord', 'plongee'], months: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2], minSizeCm: 30, tip: 'Roches et tombants, courant modéré.' },
  { name: 'Maquereau', modes: ['bord'], months: [0, 0, 0, 1, 3, 3, 3, 3, 3, 2, 0, 0], minSizeCm: 20, tip: 'Bancs en surface par beau temps, pêche aux plumes depuis les môles.' },
  { name: 'Daurade royale', modes: ['bord', 'plongee'], months: [0, 0, 0, 1, 1, 2, 3, 3, 3, 3, 2, 0], minSizeCm: 23, tip: 'Fonds sableux/rocheux, coefficients moyens à forts, eau chaude.' },
  { name: 'Seiche', modes: ['bord', 'plongee'], months: [0, 1, 3, 3, 3, 2, 0, 0, 1, 2, 2, 1], tip: 'Au printemps près de la côte pour la ponte, eau claire.' },
  { name: 'Mulet', modes: ['bord'], months: [0, 0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0], tip: 'Ports, estuaires et rias, eau calme.' },
  { name: 'Vieille (labre)', modes: ['bord', 'plongee'], months: [0, 0, 0, 1, 2, 3, 3, 3, 2, 1, 0, 0], tip: 'Zones rocheuses et algues, eau calme et claire.' },
  { name: 'Congre', modes: ['bord', 'plongee'], months: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], tip: 'Toute l’année dans les épaves et failles ; pêche de nuit depuis le bord.' },
]

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
