import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { checkPassword, db, ensureSchema, fail, guard, hashCode, hashPassword, signToken, userOf } from './_lib/core.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_LIFE = 14 * 864e5
const MAX_OPEN_INVITES = 5

/** SETUP_CODE (optionnel) : code de démarrage pour créer le tout premier compte, quand personne ne peut encore inviter. */
const bootCodes = () => (process.env.SETUP_CODE ?? '').split(',').map((c) => c.trim()).filter(Boolean)

/**
 * Création de compte sur invitation : { action: 'setup', email, password, code }
 * Invitation : { action: 'invite' } (connecté) → code à usage unique, valable 14 jours
 * Connexion : { action: 'login', email, password }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST', false)) return
  try {
    await ensureSchema()
    const { action, password, code, email } = (req.body ?? {}) as { action?: string; password?: string; code?: string; email?: string }

    if (action === 'invite') {
      const uid = userOf(req)
      if (!uid) return void res.status(401).json({ error: 'Non connecté' })
      const now = Date.now()
      const open = await db().query('select count(*)::int as n from invites where created_by = $1 and used_by is null and expires_at > $2', [uid, now])
      if (open.rows[0].n >= MAX_OPEN_INVITES) return void res.status(429).json({ error: `Tu as déjà ${MAX_OPEN_INVITES} invitations en attente : attends qu’elles soient utilisées ou expirées` })
      const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
      const fresh = 'inv-' + Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join('')
      await db().query('insert into invites (code_hash, created_by, created_at, expires_at) values ($1, $2, $3, $4)', [hashCode(fresh), uid, now, now + INVITE_LIFE])
      return void res.json({ code: fresh, expiresAt: now + INVITE_LIFE })
    }

    if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })
    const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (action === 'setup') {
      if (!EMAIL.test(mail)) return void res.status(400).json({ error: 'Adresse e-mail invalide' })
      const given = code?.trim() ?? ''
      const invite = given ? await db().query('select created_by from invites where code_hash = $1 and used_by is null and expires_at > $2', [hashCode(given), Date.now()]) : null
      if (!given || (!invite?.rowCount && !bootCodes().includes(given))) {
        await sleep(800)
        return void res.status(403).json({ error: 'Code d’invitation incorrect ou expiré' })
      }
      if ((await db().query('select 1 from users where code_hash = $1', [hashCode(given)])).rowCount) return void res.status(403).json({ error: 'Ce code a déjà servi à créer un compte' })
      if ((await db().query('select 1 from users where email = $1', [mail])).rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      const ins = await db().query('insert into users (email, pass_hash, code_hash) values ($1, $2, $3) on conflict do nothing returning id', [mail, hashPassword(password), hashCode(given)])
      if (!ins.rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      const id = ins.rows[0].id as number
      await db().query('update invites set used_by = $2 where code_hash = $1', [hashCode(given), id])
      // L'invité reçoit une demande d'ami de la part de celui qui l'a invité (il reste libre de l'accepter).
      if (invite?.rowCount) {
        const a = Math.min(id, invite.rows[0].created_by), b = Math.max(id, invite.rows[0].created_by)
        await db().query("insert into friendships (user_a, user_b, requester, status, created_at) values ($1, $2, $3, 'pending', $4) on conflict do nothing", [a, b, invite.rows[0].created_by, Date.now()])
      }
      return void res.json({ token: signToken(id), email: mail })
    }

    if (action === 'login') {
      // Compte trouvé par e-mail ; les comptes créés avant l'ajout de l'e-mail n'en ont pas : mot de passe seul.
      const found = await db().query('select id, pass_hash, email from users where email = $1 or email is null order by email is null limit 1', [mail])
      const row = found.rows[0]
      if (!row || !checkPassword(password, row.pass_hash)) {
        await sleep(800)
        return void res.status(401).json({ error: 'E-mail ou mot de passe incorrect' })
      }
      return void res.json({ token: signToken(row.id), email: row.email ?? mail })
    }
    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    fail(res, e)
  }
}
