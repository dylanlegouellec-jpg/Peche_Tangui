// Extrait de la base ouverte « tide-database » (MIT, données TICON-4 / REFMAR en CC BY 4.0) les stations de marée
// des côtes de Bretagne, Normandie et Pays de la Loire, pour prédire les marées sans réseau et sans abonnement.
//
// Utilisation (le paquet est volumineux, on ne l'installe pas dans le projet) :
//   npm install --no-save @neaps/tide-database && node scripts/extract-tide-stations.mjs
import { writeFileSync } from 'node:fs'
import { stations } from '@neaps/tide-database'

const picked = stations
  .filter((s) => s.type === 'reference' && s.latitude > 46 && s.latitude < 49.9 && s.longitude > -6.2 && s.longitude < 0.6)
  .map((s) => ({
    id: s.id,
    name: s.name,
    lat: +s.latitude.toFixed(5),
    lon: +s.longitude.toFixed(5),
    msl: +s.datums.MSL.toFixed(3),
    c: s.harmonic_constituents.map((c) => [c.name, +c.amplitude.toFixed(4), +c.phase.toFixed(2)]),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const out = {
  source: 'Données harmoniques : TICON-4 (Hart-Davis, Dettmering, Seitz et al.), CC BY 4.0, jauges REFMAR. Compilation : Neaps tide-database (MIT).',
  stations: picked,
}
writeFileSync(new URL('../src/data/tide-stations.json', import.meta.url), JSON.stringify(out))
console.log(`${picked.length} stations écrites`)
