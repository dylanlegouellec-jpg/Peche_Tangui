import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

let pool: pg.Pool | undefined
export const db = () => (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: process.env.PGSSL === 'off' ? false : undefined }))

const SCHEMA = `
create table if not exists app_user (id int primary key check (id = 1), pass_hash text not null);
create table if not exists spots (uid text primary key, data jsonb not null, updated_at bigint not null, synced_at bigint not null, deleted boolean not null default false);
create table if not exists trips (uid text primary key, data jsonb not null, updated_at bigint not null, synced_at bigint not null, deleted boolean not null default false);
create table if not exists photos (uid text primary key, trip_uid text not null, data bytea not null);
create table if not exists app_settings (id int primary key check (id = 1), data jsonb not null, updated_at bigint not null, synced_at bigint not null);
create index if not exists spots_synced on spots (synced_at);
create index if not exists trips_synced on trips (synced_at);
`
let ready: Promise<unknown> | undefined
export const ensureSchema = () => (ready ??= db().query(SCHEMA).catch((e) => ((ready = undefined), Promise.reject(e))))

const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) throw new Error('JWT_SECRET manquant')
  return s
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signToken(days = 90) {
  const body = b64(JSON.stringify({ exp: Date.now() + days * 864e5 }))
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false
  const [body, sig] = token.split('.')
  if (!body || !sig) return false
  const good = createHmac('sha256', secret()).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) return false
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now()
  } catch {
    return false
  }
}

export const hashPassword = (pw: string) => {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`
}

export const checkPassword = (pw: string, stored: string) => {
  const [salt, hash] = stored.split(':')
  const a = scryptSync(pw, Buffer.from(salt, 'hex'), 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Vérifie la méthode et le jeton ; renvoie false (et répond) si refusé. */
export function guard(req: VercelRequest, res: VercelResponse, method: string, needAuth = true): boolean {
  if (req.method !== method) {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return false
  }
  if (needAuth && !verifyToken(req.headers.authorization?.replace(/^Bearer /, ''))) {
    res.status(401).json({ error: 'Non connecté' })
    return false
  }
  return true
}

export function fail(res: VercelResponse, e: unknown) {
  console.error(e)
  res.status(500).json({ error: 'Erreur serveur' })
}
