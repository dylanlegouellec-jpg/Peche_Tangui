import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, ensureSchema, fail, guard, userOf } from './_lib/core.js'

/** POST { uid, tripUid, data (base64) } envoie une photo ; GET ?uid=... la renvoie. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (!(await guard(req, res, 'GET'))) return
    try {
      await ensureSchema()
      // Mes photos, ou celles d'un ami (photo de profil, ou sortie non privée).
      const r = await db().query(
        `select p.data from photos p where p.uid = $1 and (p.user_id = $2 or (
           exists (select 1 from friendships f where f.status = 'accepted' and ((f.user_a = $2 and f.user_b = p.user_id) or (f.user_b = $2 and f.user_a = p.user_id)))
           and (p.trip_uid = 'profile' or exists (select 1 from trips t where t.uid = p.trip_uid and t.user_id = p.user_id and not t.deleted and coalesce(t.data->>'private', 'false') <> 'true'))))`,
        [String(req.query.uid), userOf(req)],
      )
      if (!r.rowCount) return void res.status(404).json({ error: 'Photo introuvable' })
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=86400')
      return void res.send(r.rows[0].data)
    } catch (e) {
      return fail(res, e)
    }
  }
  if (!(await guard(req, res, 'POST'))) return
  try {
    await ensureSchema()
    const { uid, tripUid, data } = (req.body ?? {}) as { uid?: string; tripUid?: string; data?: string }
    if (!uid || !tripUid || !data || uid.length > 64 || tripUid.length > 64) return void res.status(400).json({ error: 'Champs manquants' })
    const buf = Buffer.from(data, 'base64')
    // Photos déjà réduites par l'appli (~300 Ko) : on refuse les fichiers trop lourds et ce qui n'est pas une image
    if (buf.length > 2.5 * 1024 * 1024) return void res.status(413).json({ error: 'Photo trop lourde (2,5 Mo max)' })
    const isImage = (buf[0] === 0xff && buf[1] === 0xd8) || buf.subarray(0, 4).toString('hex') === '89504e47' || buf.subarray(8, 12).toString() === 'WEBP'
    if (!isImage) return void res.status(415).json({ error: 'Format de photo non reconnu' })
    await db().query('insert into photos (uid, trip_uid, data, user_id) values ($1, $2, $3, $4) on conflict (uid) do nothing', [uid, tripUid, buf, userOf(req)])
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
}

