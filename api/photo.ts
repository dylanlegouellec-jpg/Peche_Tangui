import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, ensureSchema, fail, guard, userOf } from './_lib/core.js'

/** POST { uid, tripUid, data (base64) } envoie une photo ; GET ?uid=... la renvoie. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (!guard(req, res, 'GET')) return
    try {
      await ensureSchema()
      // Mes photos, ou celles d'un ami (photo de profil, ou sortie non privée).
      const r = await db().query(
        `select p.data from photos p where p.uid = $1 and (p.user_id = $2 or (
           exists (select 1 from friendships f where f.status = 'accepted' and ((f.user_a = $2 and f.user_b = p.user_id) or (f.user_b = $2 and f.user_a = p.user_id)))
           and (p.trip_uid = 'profile' or exists (select 1 from trips t where t.uid = p.trip_uid and not t.deleted and coalesce(t.data->>'private', 'false') <> 'true'))))`,
        [String(req.query.uid), userOf(req)],
      )
      if (!r.rowCount) return void res.status(404).json({ error: 'Photo introuvable' })
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
      return void res.send(r.rows[0].data)
    } catch (e) {
      return fail(res, e)
    }
  }
  if (!guard(req, res, 'POST')) return
  try {
    await ensureSchema()
    const { uid, tripUid, data } = (req.body ?? {}) as { uid?: string; tripUid?: string; data?: string }
    if (!uid || !tripUid || !data) return void res.status(400).json({ error: 'Champs manquants' })
    await db().query('insert into photos (uid, trip_uid, data, user_id) values ($1, $2, $3, $4) on conflict (uid) do nothing', [uid, tripUid, Buffer.from(data, 'base64'), userOf(req)])
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
}

