import { photoBlobs } from './store'
import type { Stats } from './stats'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const NAVY: [number, number, number] = [11, 31, 46]
const BLUE: [number, number, number] = [47, 155, 216]
const GREY: [number, number, number] = [110, 128, 145]

const dataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export interface PdfMeta {
  title: string
  subtitle: string
  author?: string
}

/** Génère le bilan de saison en PDF (A4) : chiffres clés, espèces, spots, mois, plus belles prises et liste des sorties. */
export async function buildReport(stats: Stats, meta: PdfMeta): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 16
  let y = 0

  const page = () => {
    doc.addPage()
    y = M
  }
  const need = (h: number) => y + h > 281 && page()
  const text = (s: string, x: number, size = 10, color: [number, number, number] = NAVY, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style).setFontSize(size).setTextColor(...color).text(s, x, y)
  }
  const h2 = (s: string) => {
    need(14)
    y += 4
    text(s, M, 13, NAVY, 'bold')
    doc.setDrawColor(...BLUE).setLineWidth(0.6).line(M, y + 2, M + 24, y + 2)
    y += 9
  }

  // En-tête
  doc.setFillColor(...NAVY).rect(0, 0, W, 38, 'F')
  y = 18
  text(meta.title, M, 22, [255, 255, 255], 'bold')
  y = 28
  text(meta.subtitle, M, 11, [180, 210, 232])
  if (meta.author) text(meta.author, W - M - doc.getTextWidth(meta.author), 11, [180, 210, 232])
  y = 50

  // Chiffres clés
  const kpis: [string, string][] = [
    [String(stats.trips), 'sorties'],
    [String(stats.catches), 'prises'],
    [stats.trips ? `${Math.round(((stats.trips - stats.blank) / stats.trips) * 100)} %` : '—', 'sorties réussies'],
    [stats.weight ? `${stats.weight.toFixed(1)} kg` : '—', 'poids total'],
  ]
  const bw = (W - 2 * M - 9) / 4
  kpis.forEach(([v, l], i) => {
    const x = M + i * (bw + 3)
    doc.setFillColor(238, 245, 250).roundedRect(x, y - 8, bw, 22, 3, 3, 'F')
    text(v, x + 4, 16, BLUE, 'bold')
    y += 8
    text(l, x + 4, 8.5, GREY)
    y -= 8
  })
  y += 24

  if (stats.biggest) {
    text(`Plus belle prise : ${stats.biggest.species}, ${stats.biggest.size} cm (${stats.biggest.spot}, ${fmtDate(stats.biggest.date)})`, M, 10)
    y += 6
  }
  const a = stats.avg
  if (a.seaTemp != null || a.wind != null) {
    const parts = [a.airTemp != null && `air ${a.airTemp.toFixed(0)} °C`, a.seaTemp != null && `eau ${a.seaTemp.toFixed(1)} °C`, a.wind != null && `vent ${a.wind.toFixed(0)} km/h`, a.wave != null && `houle ${a.wave.toFixed(1)} m`, a.pressure != null && `pression ${a.pressure.toFixed(0)} hPa`].filter(Boolean)
    text(`Conditions moyennes des sorties réussies : ${parts.join(' · ')}`, M, 9, GREY)
    y += 6
  }

  // Espèces
  if (stats.species.length) {
    h2('Prises par espèce')
    const max = stats.species[0].count
    for (const s of stats.species.slice(0, 12)) {
      need(8)
      text(s.name, M, 10)
      const bx = M + 52
      const len = Math.max(2, (s.count / max) * 80)
      doc.setFillColor(...BLUE).roundedRect(bx, y - 3.6, len, 4.6, 1, 1, 'F')
      text(`${s.count}${s.maxSize ? ` · max ${s.maxSize} cm` : ''}${s.weight ? ` · ${s.weight.toFixed(1)} kg` : ''}`, bx + len + 3, 9, GREY)
      y += 7
    }
  }

  // Mois
  if (stats.months.some((m) => m)) {
    h2('Prises par mois')
    need(36)
    const max = Math.max(...stats.months, 1)
    const bwid = (W - 2 * M) / 12
    stats.months.forEach((n, i) => {
      const hh = (n / max) * 24
      doc.setFillColor(...(n ? BLUE : ([225, 233, 240] as [number, number, number]))).rect(M + i * bwid + 2, y + 24 - hh, bwid - 4, Math.max(hh, 0.8), 'F')
      if (n) text(String(n), M + i * bwid + bwid / 2 - 1.2, 8, NAVY)
      const save = y
      y = save + 29
      text(MONTHS[i], M + i * bwid + 1.5, 7.5, GREY)
      y = save
    })
    y += 32
  }

  // Spots
  if (stats.spots.length) {
    h2('Spots')
    for (const s of stats.spots.slice(0, 10)) {
      need(7)
      text(s.name, M, 10)
      text(`${s.trips} sortie${s.trips > 1 ? 's' : ''} · ${s.catches} prise${s.catches > 1 ? 's' : ''}`, M + 90, 10, GREY)
      y += 6.5
    }
  }

  // Plus belles prises en photo (les sorties les plus fournies)
  const withPhotos = stats.tripsList.filter((t) => t.photoUids.length).sort((x, y2) => y2.catches.length - x.catches.length).slice(0, 6)
  if (withPhotos.length) {
    const cell = (W - 2 * M - 8) / 3
    need(cell + 30) // titre + première rangée sur la même page
    h2('En photos')
    let col = 0
    for (const t of withPhotos) {
      const blob = (await photoBlobs([t.photoUids[0]]))[0]
      if (!blob) continue
      if (col === 0) need(cell + 14)
      const x = M + col * (cell + 4)
      try {
        const img = await dataUrl(blob)
        const props = doc.getImageProperties(img)
        const scale = Math.min(cell / props.width, cell / props.height)
        doc.addImage(img, 'JPEG', x, y, props.width * scale, props.height * scale, undefined, 'FAST')
      } catch {
        /* photo illisible : on passe */
      }
      const label = `${t.catches.map((c) => c.species).slice(0, 2).join(', ') || 'Bredouille'} · ${new Date(t.date).toLocaleDateString('fr-FR')}`
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY).text(doc.splitTextToSize(label, cell), x, y + cell + 4)
      col++
      if (col === 3) {
        col = 0
        y += cell + 12
      }
    }
    if (col) y += cell + 12
  }

  // Liste des sorties
  if (stats.tripsList.length) {
    h2('Toutes les sorties')
    for (const t of [...stats.tripsList].reverse()) {
      need(11)
      text(`${new Date(t.date).toLocaleDateString('fr-FR')}  ${t.spotName}`, M, 9.5, NAVY, 'bold')
      text(t.mode === 'bord' ? 'bord de mer' : 'sous-marine', W - M - 28, 8.5, GREY)
      y += 4.6
      const line = t.catches.length ? t.catches.map((c) => `${c.species}${c.sizeCm ? ` ${c.sizeCm} cm` : ''}${c.weightKg ? ` ${c.weightKg} kg` : ''}`).join(', ') : 'Bredouille'
      const wrapped = doc.splitTextToSize(line, W - 2 * M) as string[]
      for (const l of wrapped.slice(0, 3)) {
        text(l, M, 9, GREY)
        y += 4.2
      }
      y += 2
    }
  }

  // Pieds de page
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY).text(`Pêche · ${meta.subtitle} · page ${i}/${n}`, M, 290)
  }
  return doc.output('blob')
}

/** Partage le PDF (feuille de partage iOS/Android : Enregistrer dans Fichiers, AirDrop…) ou le télécharge. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return 'downloaded'
}
