import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

let pool: pg.Pool | undefined
export const db = () => (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: process.env.PGSSL === 'off' ? false : undefined }))

/**
 * Migrations de la base, appliquées une seule fois chacune (numéro gardé dans schema_version).
 * Au démarrage, le serveur ne fait plus qu'une lecture rapide du numéro ; les modifications ne tournent que s'il en manque.
 */
const MIGRATIONS = [
  // 1 : schéma complet tel qu'il existait jusqu'ici (instructions sans effet si déjà appliquées)
  `create table if not exists app_user (id int primary key check (id = 1), pass_hash text not null);
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
create table if not exists friendships (user_a int not null, user_b int not null, requester int not null, status text not null, created_at bigint not null, primary key (user_a, user_b));
create table if not exists invites (code_hash text primary key, created_by int not null, created_at bigint not null, expires_at bigint not null, used_by int);
create index if not exists spots_synced on spots (user_id, synced_at);
create index if not exists trips_synced on trips (user_id, synced_at);`,
  // 2 : un même identifiant peut exister dans deux comptes (spots de départ communs à tous) ; un code ne crée qu'un compte
  `alter table spots drop constraint if exists spots_pkey;
alter table spots add primary key (user_id, uid);
alter table trips drop constraint if exists trips_pkey;
alter table trips add primary key (user_id, uid);
do $$ begin
  create unique index if not exists users_code_hash on users (code_hash) where code_hash is not null;
exception when unique_violation then raise notice 'codes en double : index ignoré';
end $$;`,
  // 3 : essais de connexion ratés (limite contre les attaques par essais répétés)
  `create table if not exists auth_failures (key text not null, at bigint not null);
create index if not exists auth_failures_key on auth_failures (key, at);`,
  // 4 : version des jetons de connexion (l'augmenter déconnecte tous les appareils du compte)
  `alter table users add column if not exists token_version int not null default 0;`,
]

/** Trop d'essais ratés récemment pour l'une de ces clés (adresse IP, e-mail) ? Fenêtre de 15 min. */
export async function tooManyFailures(keys: string[], max: number) {
  const r = await db().query('select key, count(*)::int as n from auth_failures where key = any($1) and at > $2 group by key', [keys, Date.now() - 15 * 60e3])
  return r.rows.some((x) => x.n >= max)
}
export async function recordFailure(keys: string[]) {
  const now = Date.now()
  await db().query('insert into auth_failures (key, at) select unnest($1::text[]), $2', [keys, now])
  await db().query('delete from auth_failures where at < $1', [now - 24 * 3600e3])
}
export const clientIp = (req: VercelRequest) => String(req.headers['x-forwarded-for'] ?? 'inconnue').split(',')[0].trim()

async function migrate() {
  const client = await db().connect()
  try {
    await client.query('create table if not exists schema_version (v int not null)')
    const cur = Number((await client.query('select max(v) as v from schema_version')).rows[0].v ?? 0)
    if (cur >= MIGRATIONS.length) return
    await client.query('begin')
    // Verrou : si deux serveurs démarrent en même temps, un seul applique les migrations
    await client.query('select pg_advisory_xact_lock(424242)')
    const now = Number((await client.query('select max(v) as v from schema_version')).rows[0].v ?? 0)
    for (let v = now + 1; v <= MIGRATIONS.length; v++) {
      await client.query(MIGRATIONS[v - 1])
      await client.query('insert into schema_version (v) values ($1)', [v])
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

let ready: Promise<unknown> | undefined
export const ensureSchema = () => (ready ??= migrate().catch((e) => ((ready = undefined), Promise.reject(e))))

const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) throw new Error('JWT_SECRET manquant')
  return s
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signToken(uid: number, tv = 0, days = 90) {
  const body = b64(JSON.stringify({ exp: Date.now() + days * 864e5, uid, tv }))
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`
}

/** Contenu d'un jeton valide (signature et date), ou null. Les anciens jetons sans numéro sont ceux du compte 1, version 0. */
function tokenPayload(token: string | undefined): { uid: number; tv: number } | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const good = createHmac('sha256', secret()).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp: number; uid?: number; tv?: number }
    return p.exp > Date.now() ? { uid: p.uid ?? 1, tv: p.tv ?? 0 } : null
  } catch {
    return null
  }
}

const bearer = (req: VercelRequest) => req.headers.authorization?.replace(/^Bearer /, '')

/** Numéro du compte du jeton (signature seule, sans vérifier la base) : à utiliser après `guard`, qui a déjà tout vérifié. */
export const userOf = (req: VercelRequest) => tokenPayload(bearer(req))?.uid ?? 0

/** Compte connecté, vérifié en base : le compte existe encore et le jeton n'a pas été révoqué. 0 sinon. */
export async function authUser(req: VercelRequest): Promise<number> {
  const p = tokenPayload(bearer(req))
  if (!p) return 0
  await ensureSchema()
  const r = await db().query('select token_version from users where id = $1', [p.uid])
  return r.rowCount && Number(r.rows[0].token_version) === p.tv ? p.uid : 0
}

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
export async function guard(req: VercelRequest, res: VercelResponse, method: string, needAuth = true): Promise<boolean> {
  if (req.method !== method) {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return false
  }
  if (needAuth && !(await authUser(req))) {
    res.status(401).json({ error: 'Non connecté' })
    return false
  }
  return true
}

export function fail(res: VercelResponse, e: unknown) {
  console.error(e)
  res.status(500).json({ error: 'Erreur serveur' })
}
