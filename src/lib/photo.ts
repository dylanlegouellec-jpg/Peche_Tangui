const MAX_BYTES = 120 * 1024

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('photo'))), 'image/jpeg', quality))

/**
 * Compresse une photo pour qu'elle pèse le moins possible (≈ 120 Ko max) tout en restant nette :
 * on part de 1280 px / qualité 0,75, puis on baisse la qualité et la taille jusqu'à passer sous la limite.
 * JPEG volontairement : WebP n'est pas encodable de façon fiable sur Safari.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  let side = Math.min(1280, Math.max(bmp.width, bmp.height))
  let best: Blob | undefined
  for (let step = 0; step < 5; step++) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    for (const q of [0.75, 0.65, 0.55]) {
      const blob = await encode(canvas, q)
      if (!best || blob.size < best.size) best = blob
      if (blob.size <= MAX_BYTES) return blob
    }
    side = Math.round(side * 0.8)
  }
  bmp.close()
  return best!
}
