import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

let pool: pg.Pool | undefined
export const db = () => (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: process.env.PGSSL === 'off' ? false : undefined }))

const SCHEMA = `
create table if not exists app_user (id int primary key check (id = 1), pass_hash text not null);
alter table app_user add column if not exists email text;
create table if not exists users (id serial primary key, email text unique, pass_hash text not null, code_hash text);
insert into users (id, email, pass_hash) select 1, email, pass_hash from app_user on conflict do nothing;
select setval(pg_get_serial_sequence('users', 'id'), coalesce((select max(id) from users), 0) + 1, false);
create table if not exists spots (uid text primary key, data jsonb not null, updated_at bigint not null, synced_at bigint not null, deleted boolean not null default false);
create table if not exists trips (uid text primary key, data jsonb not null, updated_at bigint not null, synced_at bigint not null, deleted boolean not null default false);
create table if not exists photos (uid text primary key, trip_uid text not null, data bytea not null);
create table if not exists app_settings (id int, data jsonb not null, updated_at bigint not null, synced_at bigint not null);
alter table spots add column if not exists user_id int not null default 1;
alter table trips add column if not exists user_id int not null default 1;
alter table photos add column if not exists user_id int not null default 1;
alter table app_settings add column if not exists user_id int;
update app_settings set user_id = 1 where user_id is null;
alter table app_settings drop constraint if exists app_settings_id_check;
alter table app_settings drop constraint if exists app_settings_pkey;
alter table app_settings alter column id drop not null;
create unique index if not exists app_settings_user on app_settings (user_id);
create table if not exists signups (email text primary key, pass_hash text not null, code_hash text not null, expires_at bigint not null, attempts int not null default 0, sent_at bigint not null);
create table if not exists mail_log (ip text not null, at bigint not null);
create table if not exists friendships (user_a int not null, user_b int not null, requester int not null, status text not null, created_at bigint not null, primary key (user_a, user_b));
create table if not exists invites (code_hash text primary key, created_by int not null, created_at bigint not null, expires_at bigint not null, used_by int);
create index if not exists spots_synced on spots (user_id, synced_at);
create index if not exists trips_synced on trips (user_id, synced_at);
`
let ready: Promise<unknown> | undefined
export const ensureSchema = () => (ready ??= db().query(SCHEMA).catch((e) => ((ready = undefined), Promise.reject(e))))

const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) throw new Error('JWT_SECRET manquant')
  return s
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signToken(uid: number, days = 90) {
  const body = b64(JSON.stringify({ exp: Date.now() + days * 864e5, uid }))
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`
}

/** Numéro du compte porté par le jeton, ou 0 si le jeton est absent, faux ou expiré (les anciens jetons sans numéro sont ceux du compte 1). */
export function tokenUser(token: string | undefined): number {
  if (!token) return 0
  const [body, sig] = token.split('.')
  if (!body || !sig) return 0
  const good = createHmac('sha256', secret()).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) return 0
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp: number; uid?: number }
    return p.exp > Date.now() ? p.uid ?? 1 : 0
  } catch {
    return 0
  }
}

export const userOf = (req: VercelRequest) => tokenUser(req.headers.authorization?.replace(/^Bearer /, ''))

export const hashCode = (code: string) => createHash('sha256').update(code).digest('hex')

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
  if (needAuth && !userOf(req)) {
    res.status(401).json({ error: 'Non connecté' })
    return false
  }
  return true
}

export function fail(res: VercelResponse, e: unknown) {
  console.error(e)
  res.status(500).json({ error: 'Erreur serveur' })
}
