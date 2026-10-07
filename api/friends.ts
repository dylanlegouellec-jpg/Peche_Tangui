import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, ensureSchema, fail, guard, userOf } from './_lib/core.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const pair = (a: number, b: number) => (a < b ? [a, b] : [b, a])

/** Nom affiché d'un compte : prénom + nom du profil, sinon le début de l'e-mail. */
const NAME = `coalesce(nullif(trim(coalesce(s.data->'value'->>'firstName', s.data->>'firstName', '') || ' ' || coalesce(s.data->'value'->>'lastName', s.data->>'lastName', '')), ''), split_part(u.email, '@', 1), 'Ami')`
const AVATAR = `coalesce(s.data->'value'->>'avatarUid', s.data->>'avatarUid')`

/**
 * Amis : POST { action }
 *  list                    → mes amis, demandes reçues, demandes envoyées
 *  request { email }       → demande d'ami (ou acceptation si l'autre m'en avait déjà fait une)
 *  respond { id, accept }  → accepter / refuser une demande reçue
 *  remove { id }           → retirer un ami ou annuler une demande
 *  feed                    → dernières sorties de mes amis (hors sorties privées, sans les notes)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST')) return
  try {
    await ensureSchema()
    const me = userOf(req)
    const { action, email, id, accept } = (req.body ?? {}) as { action?: string; email?: string; id?: number; accept?: boolean }

    if (action === 'list') {
      const rows = (
        await db().query(
          `select f.status, f.requester, u.id, u.email, ${NAME} as name, ${AVATAR} as avatar
           from friendships f join users u on u.id = (case when f.user_a = $1 then f.user_b else f.user_a end)
           left join app_settings s on s.user_id = u.id
           where f.user_a = $1 or f.user_b = $1 order by name`,
          [me],
        )
      ).rows
      return void res.json({
        friends: rows.filter((r) => r.status === 'accepted').map((r) => ({ id: r.id, name: r.name, avatarUid: r.avatar })),
        incoming: rows.filter((r) => r.status === 'pending' && r.requester !== me).map((r) => ({ id: r.id, name: r.name, email: r.email })),
        outgoing: rows.filter((r) => r.status === 'pending' && r.requester === me).map((r) => ({ id: r.id, name: r.name, email: r.email })),
      })
    }

    if (action === 'request') {
      const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''
      if (!EMAIL.test(mail)) return void res.status(400).json({ error: 'Adresse e-mail invalide' })
      const other = (await db().query('select id from users where email = $1', [mail])).rows[0]
      if (!other) return void res.status(404).json({ error: 'Aucun compte avec cet e-mail. Demande-lui de créer le sien d’abord.' })
      if (other.id === me) return void res.status(400).json({ error: 'C’est ton propre compte' })
      const [a, b] = pair(me, other.id)
      const ex = (await db().query('select status, requester from friendships where user_a = $1 and user_b = $2', [a, b])).rows[0]
      if (ex?.status === 'accepted') return void res.status(409).json({ error: 'Vous êtes déjà amis' })
      if (ex && ex.requester === me) return void res.status(409).json({ error: 'Demande déjà envoyée' })
      if (ex) {
        await db().query("update friendships set status = 'accepted' where user_a = $1 and user_b = $2", [a, b])
        return void res.json({ status: 'accepted' })
      }
      await db().query("insert into friendships (user_a, user_b, requester, status, created_at) values ($1, $2, $3, 'pending', $4)", [a, b, me, Date.now()])
      return void res.json({ status: 'pending' })
    }

    if (action === 'respond' || action === 'remove') {
      if (typeof id !== 'number') return void res.status(400).json({ error: 'Ami inconnu' })
      const [a, b] = pair(me, id)
      if (action === 'respond' && accept) await db().query("update friendships set status = 'accepted' where user_a = $1 and user_b = $2 and status = 'pending' and requester = $3", [a, b, id])
      else await db().query('delete from friendships where user_a = $1 and user_b = $2', [a, b])
      return void res.json({ ok: true })
    }

    if (action === 'feed') {
      const rows = (
        await db().query(
          `select t.uid, t.data, u.id as uid_user, ${NAME} as name, ${AVATAR} as avatar
           from trips t
           join friendships f on f.status = 'accepted' and ((f.user_a = $1 and f.user_b = t.user_id) or (f.user_b = $1 and f.user_a = t.user_id))
           join users u on u.id = t.user_id
           left join app_settings s on s.user_id = u.id
           where not t.deleted and coalesce(t.data->>'private', 'false') <> 'true'
           order by (t.data->>'date')::bigint desc limit 80`,
          [me],
        )
      ).rows
      return void res.json({
        trips: rows.map((r) => {
          const d = r.data as Record<string, unknown>
          return { uid: r.uid, friendId: r.uid_user, name: r.name, avatarUid: r.avatar, date: d.date, spotName: d.spotName, mode: d.mode, catches: d.catches ?? [], photoUids: d.photoUids ?? [], snapshot: d.snapshot ?? null }
        }),
      })
    }
    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    fail(res, e)
  }
}
