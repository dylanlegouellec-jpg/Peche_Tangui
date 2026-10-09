import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Blosc } from 'numcodecs'
import * as zarr from 'zarrita'

// Copernicus Marine, modèle IBI (golfe de Gascogne, maille de ~3 km) : courants, température, vagues, transparence de l'eau.
// Les tableaux « ARCO » (Zarr) sont publics : aucun compte ni mot de passe n'est nécessaire.
zarr.registry.set('blosc', async () => ({ codecId: 'blosc', fromConfig: (c: object) => Blosc.fromConfig(c as ConstructorParameters<typeof Blosc>[0]) }) as never)

const ROOT = 'https://s3.waw3-1.cloudferro.com/mdl-arco-geo-032/arco'
const SETS = {
  phy: `${ROOT}/IBI_ANALYSISFORECAST_PHY_005_001/cmems_mod_ibi_phy_anfc_0.027deg-2D_PT1H-m_202411/geoChunked.zarr`,
  wav: `${ROOT}/IBI_ANALYSISFORECAST_WAV_005_005/cmems_mod_ibi_wav_anfc_0.027deg_PT1H-i_202411/geoChunked.zarr`,
  bgc: `${ROOT}/IBI_ANALYSISFORECAST_BGC_005_004/cmems_mod_ibi_bgc_anfc_0.027deg-3D_P1D-m_202411/geoChunked.zarr`,
}
const HOURS_1950_TO_1970 = 175320

/** Les bacs S3 de Copernicus répondent 403 (et non 404) pour un bloc absent : on le traite comme « pas de données ». */
class TolerantStore extends zarr.FetchStore {
  override async get(key: Parameters<zarr.FetchStore['get']>[0], opts?: Parameters<zarr.FetchStore['get']>[1]) {
    try {
      return await super.get(key, opts)
    } catch (e) {
      if (String(e).includes('403')) return undefined
      throw e
    }
  }
}

type Arr = zarr.Array<zarr.DataType, TolerantStore>
interface Axes {
  lat: ArrayLike<number>
  lon: ArrayLike<number>
  time: ArrayLike<number>
  at: number
  root: zarr.Location<TolerantStore>
}
const axesCache = new Map<string, Axes>()

async function open(root: zarr.Location<TolerantStore>, name: string) {
  return (await zarr.open.v2(root.resolve(name), { kind: 'array' })) as Arr
}
const read1d = async (root: zarr.Location<TolerantStore>, name: string) => (await zarr.get(await open(root, name))).data as ArrayLike<number>

/** Axes (latitude, longitude, temps) d'un jeu de données, gardés 1 h en mémoire entre deux appels. */
async function axes(set: keyof typeof SETS): Promise<Axes> {
  const hit = axesCache.get(set)
  if (hit && Date.now() - hit.at < 3600e3) return hit
  const root = zarr.root(new TolerantStore(SETS[set]))
  const [lat, lon, time] = await Promise.all([read1d(root, 'latitude'), read1d(root, 'longitude'), read1d(root, 'time')])
  const a = { lat, lon, time, at: Date.now(), root }
  axesCache.set(set, a)
  return a
}

const nearest = (arr: ArrayLike<number>, v: number) => {
  let b = 0
  for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i
  return b
}
const hoursNow = () => Date.now() / 3600e3 + HOURS_1950_TO_1970
const ts = (h: number) => Math.round((h - HOURS_1950_TO_1970) * 3600)

interface Window {
  /** Indices de la cellule d'eau la plus proche dans la fenêtre lue. */
  y: number
  x: number
  n: number
  distKm: number
  cellLat: number
  cellLon: number
}

/** Lit une fenêtre (2r+1)² autour du point, sur une plage de temps ; renvoie les données brutes et la cellule d'eau la plus proche. */
async function readBlock(a: Axes, vars: string[], lat: number, lon: number, t0: number, t1: number, extra: number[] = [], r = 3) {
  const iy = nearest(a.lat, lat)
  const ix = nearest(a.lon, lon)
  const sel = (arr: Arr) => [zarr.slice(t0, t1), ...extra, zarr.slice(iy - r, iy + r + 1), zarr.slice(ix - r, ix + r + 1)].slice(0, arr.shape.length) as (number | zarr.Slice)[]
  const arrays = await Promise.all(vars.map((v) => open(a.root, v)))
  const blocks = await Promise.all(arrays.map((arr) => zarr.get(arr, sel(arr))))
  const n = 2 * r + 1
  const nt = t1 - t0
  const raw = blocks.map((b) => b.data as Int16Array)
  return { raw, n, nt, iy, ix, r }
}

/** Parmi les cellules de la fenêtre, la plus proche du point qui a une valeur (au pas de temps `tRef`). */
function pickCell(a: Axes, raw: Int16Array, n: number, iy: number, ix: number, r: number, lat: number, lon: number, tRef: number): Window | null {
  let best: Window | null = null
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (raw[tRef * n * n + y * n + x] === -32767) continue
      const cellLat = a.lat[iy - r + y]
      const cellLon = a.lon[ix - r + x]
      const distKm = Math.hypot((cellLat - lat) * 111, (cellLon - lon) * 111 * Math.cos((lat * Math.PI) / 180))
      if (!best || distKm < best.distKm) best = { y, x, n, distKm, cellLat, cellLon }
    }
  return best
}

const val = (raw: Int16Array, k: number, scale: number, offset: number) => (raw[k] === -32767 ? null : raw[k] * scale + offset)

async function physics(lat: number, lon: number) {
  const a = await axes('phy')
  const now = hoursNow()
  let ti = 0
  while (ti < a.time.length - 1 && a.time[ti] < now) ti++
  const t0 = Math.max(0, ti - 24)
  const t1 = a.time.length
  const { raw, n, iy, ix, r } = await readBlock(a, ['uo', 'vo', 'thetao'], lat, lon, t0, t1)
  const cell = pickCell(a, raw[0], n, iy, ix, r, lat, lon, ti - t0)
  if (!cell) return null
  const rows: { ts: number; speed: number | null; dir: number | null; temp: number | null; front: number | null }[] = []
  // Taille d'une maille en km (nord-sud, est-ouest) pour mesurer les écarts de température
  const dyKm = Math.abs(a.lat[iy + 1] - a.lat[iy]) * 111
  const dxKm = Math.abs(a.lon[ix + 1] - a.lon[ix]) * 111 * Math.cos((lat * Math.PI) / 180)
  for (let h = 0; h < t1 - t0; h++) {
    const base = h * n * n
    // Front thermique : plus fort écart de température entre deux mailles d'eau voisines, en °C par km, sur la fenêtre de ±9 km
    let front: number | null = null
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const t = val(raw[2], base + y * n + x, 0.001, 10)
        if (t == null) continue
        const e = x + 1 < n ? val(raw[2], base + y * n + x + 1, 0.001, 10) : null
        const s = y + 1 < n ? val(raw[2], base + (y + 1) * n + x, 0.001, 10) : null
        if (e != null) front = Math.max(front ?? 0, Math.abs(e - t) / dxKm)
        if (s != null) front = Math.max(front ?? 0, Math.abs(s - t) / dyKm)
      }
    const k = h * n * n + cell.y * n + cell.x
    const u = val(raw[0], k, 0.001, 0)
    const v = val(raw[1], k, 0.001, 0)
    rows.push({
      ts: ts(a.time[t0 + h]),
      speed: u == null || v == null ? null : +(Math.hypot(u, v) * 3.6).toFixed(2),
      dir: u == null || v == null ? null : Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360),
      temp: val(raw[2], k, 0.001, 10),
      front: front == null ? null : +front.toFixed(3),
    })
  }
  return { cell: { lat: cell.cellLat, lon: cell.cellLon, km: +cell.distKm.toFixed(1) }, rows }
}

async function waves(lat: number, lon: number) {
  const a = await axes('wav')
  const now = hoursNow()
  let ti = 0
  while (ti < a.time.length - 1 && a.time[ti] < now) ti++
  const t0 = Math.max(0, ti - 24)
  const t1 = a.time.length
  const { raw, n, iy, ix, r } = await readBlock(a, ['VHM0', 'VMDR', 'VTPK'], lat, lon, t0, t1)
  const cell = pickCell(a, raw[0], n, iy, ix, r, lat, lon, ti - t0)
  if (!cell) return null
  const rows: { ts: number; h: number | null; dir: number | null; per: number | null }[] = []
  for (let i = 0; i < t1 - t0; i++) {
    const k = i * n * n + cell.y * n + cell.x
    const dir = val(raw[1], k, 0.01, 180)
    rows.push({ ts: ts(a.time[t0 + i]), h: val(raw[0], k, 0.01, 0), dir: dir == null ? null : Math.round(((dir % 360) + 360) % 360), per: val(raw[2], k, 0.01, 0) })
  }
  return { cell: { lat: cell.cellLat, lon: cell.cellLon, km: +cell.distKm.toFixed(1) }, rows }
}

/** Profondeur de la zone éclairée (zeu, 1 % de la lumière de surface) du jour, d'où on tire une transparence de l'eau (disque de Secchi ≈ 0,37 × zeu). */
async function clarity(lat: number, lon: number) {
  const a = await axes('bgc')
  const now = hoursNow()
  let ti = 0
  while (ti < a.time.length - 1 && a.time[ti] < now) ti++
  const iy = nearest(a.lat, lat)
  const ix = nearest(a.lon, lon)
  const r = 3
  const zeuArr = await open(a.root, 'zeu')
  const zeu = await zarr.get(zeuArr, [zarr.slice(ti, ti + 1), zarr.slice(iy - r, iy + r + 1), zarr.slice(ix - r, ix + r + 1)])
  const n = 2 * r + 1
  const z = zeu.data as Int16Array
  let best: { k: number; d: number } | null = null
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const k = y * n + x
      if (z[k] === -32767) continue
      const d = Math.hypot((a.lat[iy - r + y] - lat) * 111, (a.lon[ix - r + x] - lon) * 111 * Math.cos((lat * Math.PI) / 180))
      if (!best || d < best.d) best = { k, d }
    }
  if (!best) return null
  const zeuM = z[best.k] * 0.1
  return { ts: ts(a.time[ti]), zeu: +zeuM.toFixed(1), secchi: +(zeuM * 0.37).toFixed(1), km: +best.d.toFixed(1) }
}

/**
 * GET ?lat=..&lon=.. : courants, température de l'eau, vagues et transparence autour d'un point (Copernicus Marine IBI, ~3 km).
 * Chaque bloc est indépendant : si l'un échoue, les autres sont quand même renvoyés.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  // Zone couverte par le modèle IBI, sans en faire un relais ouvert
  if (!(lat > 36 && lat < 56 && lon > -19 && lon < 5)) return void res.status(400).json({ error: 'Position hors zone' })
  const settle = async <T,>(p: Promise<T>) => p.catch((e) => (console.error('CMEMS', e), null))
  const [phy, wav, bgc] = await Promise.all([settle(physics(lat, lon)), settle(waves(lat, lon)), settle(clarity(lat, lon))])
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600')
  res.json({ source: 'Copernicus Marine IBI', phy, wav, bgc })
}
