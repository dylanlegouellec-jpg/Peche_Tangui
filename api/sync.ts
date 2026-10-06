import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, ensureSchema, fail, guard } from './_lib/core.js'

interface Doc {
  uid: string
  data: Record<string, unknown>
  updatedAt: number
  deleted?: boolean
}

const TABLES = ['spots', 'trips'] as const

/**
 * POST { since, spots, trips, settings? } : enregistre les modifications locales (la plus récente gagne)
 * et renvoie tout ce qui a changé côté serveur depuis `since`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST')) return
  try {
    await ensureSchema()
    const body = (req.body ?? {}) as { since?: number; spots?: Doc[]; trips?: Doc[]; settings?: { data: unknown; updatedAt: number } }
    const since = Number(body.since) || 0
    const now = Date.now()
    const client = await db().connect()
    try {
      await client.query('begin')
      for (const t of TABLES) {
        for (const d of body[t] ?? []) {
          if (typeof d.uid !== 'string' || typeof d.updatedAt !== 'number') continue
          await client.query(
            `insert into ${t} (uid, data, updated_at, synced_at, deleted) values ($1, $2, $3, $4, $5)
             on conflict (uid) do update set data = excluded.data, updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted = excluded.deleted
             where ${t}.updated_at < excluded.updated_at`,
            [d.uid, JSON.stringify(d.data ?? {}), d.updatedAt, now, !!d.deleted],
          )
        }
      }
      if (body.settings && typeof body.settings.updatedAt === 'number') {
        await client.query(
          `insert into app_settings (id, data, updated_at, synced_at) values (1, $1, $2, $3)
           on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, synced_at = excluded.synced_at
           where app_settings.updated_at < excluded.updated_at`,
          [JSON.stringify(body.settings.data ?? {}), body.settings.updatedAt, now],
        )
      }
      await client.query('commit')
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }

    const pull = async (t: (typeof TABLES)[number]) =>
      (await db().query(`select uid, data, updated_at, deleted from ${t} where synced_at > $1`, [since])).rows.map((r) => ({ uid: r.uid, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted }))
    const s = await db().query('select data, updated_at from app_settings where id = 1 and synced_at > $1', [since])
    res.json({
      // marge de 5 s : une relecture est inoffensive (la plus récente gagne côté client aussi)
      cursor: now - 5000,
      spots: await pull('spots'),
      trips: await pull('trips'),
      settings: s.rowCount ? { data: s.rows[0].data, updatedAt: Number(s.rows[0].updated_at) } : null,
    })
  } catch (e) {
    fail(res, e)
  }
}
