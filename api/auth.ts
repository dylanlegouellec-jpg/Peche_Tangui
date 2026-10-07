import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomInt } from 'node:crypto'
import { mailConfigured, sendMail } from './_lib/mail.js'
import { checkPassword, db, ensureSchema, fail, guard, hashCode, hashPassword, signToken } from './_lib/core.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HOUR = 3600e3
const CODE_LIFE = 15 * 60e3
const MAX_TRIES = 5

/**
 * Création de compte avec vérification de l'e-mail :
 *   { action: 'start', email, password }  → envoie un code à 6 chiffres par e-mail
 *   { action: 'verify', email, code }     → crée le compte si le code est bon
 * Connexion : { action: 'login', email, password }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST', false)) return
  try {
    await ensureSchema()
    const { action, password, code, email } = (req.body ?? {}) as { action?: string; password?: string; code?: string; email?: string }
    const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (action === 'start') {
      if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })
      if (!EMAIL.test(mail) || mail.length > 120) return void res.status(400).json({ error: 'Adresse e-mail invalide' })
      if (!mailConfigured()) return void res.status(503).json({ error: 'L’envoi d’e-mails n’est pas encore configuré sur le serveur' })
      if ((await db().query('select 1 from users where email = $1', [mail])).rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      const now = Date.now()
      const prev = await db().query('select sent_at from signups where email = $1', [mail])
      if (prev.rowCount && now - Number(prev.rows[0].sent_at) < 60e3) return void res.status(429).json({ error: 'Un code vient d’être envoyé : attends une minute avant d’en demander un autre' })
      // Garde-fous contre les abus : 5 envois par heure et par connexion, 150 par jour au total (limite de Gmail : 500).
      const ip = String(req.headers['x-forwarded-for'] ?? 'inconnue').split(',')[0].trim()
      const perIp = await db().query('select count(*)::int as n from mail_log where ip = $1 and at > $2', [ip, now - HOUR])
      const perDay = await db().query('select count(*)::int as n from mail_log where at > $1', [now - 24 * HOUR])
      if (perIp.rows[0].n >= 5 || perDay.rows[0].n >= 150) return void res.status(429).json({ error: 'Trop de demandes pour le moment, réessaie plus tard' })
      const digits = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await db().query(
        `insert into signups (email, pass_hash, code_hash, expires_at, attempts, sent_at) values ($1, $2, $3, $4, 0, $5)
         on conflict (email) do update set pass_hash = excluded.pass_hash, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
        [mail, hashPassword(password), hashCode(mail + ':' + digits), now + CODE_LIFE, now],
      )
      await db().query('insert into mail_log (ip, at) values ($1, $2)', [ip, now])
      await db().query('delete from mail_log where at < $1', [now - 24 * HOUR])
      try {
        await sendMail(mail, `Ton code pour l’appli de pêche : ${digits}`, `Ton code de vérification : ${digits}\n\nIl est valable 15 minutes. Si tu n’as rien demandé, ignore ce message.`)
      } catch (e) {
        console.error(e)
        await db().query('delete from signups where email = $1', [mail])
        return void res.status(502).json({ error: 'L’e-mail n’a pas pu être envoyé. Vérifie l’adresse et réessaie.' })
      }
      return void res.json({ sent: true })
    }

    if (action === 'verify') {
      const row = (await db().query('select pass_hash, code_hash, expires_at, attempts from signups where email = $1', [mail])).rows[0]
      if (!row || Number(row.expires_at) < Date.now()) return void res.status(410).json({ error: 'Code expiré : demande-en un nouveau' })
      if (row.attempts >= MAX_TRIES) return void res.status(429).json({ error: 'Trop d’essais : demande un nouveau code' })
      if (hashCode(mail + ':' + String(code ?? '').trim()) !== row.code_hash) {
        await db().query('update signups set attempts = attempts + 1 where email = $1', [mail])
        await sleep(500)
        return void res.status(403).json({ error: 'Code incorrect' })
      }
      const ins = await db().query('insert into users (email, pass_hash) values ($1, $2) on conflict do nothing returning id', [mail, row.pass_hash])
      await db().query('delete from signups where email = $1', [mail])
      if (!ins.rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      return void res.json({ token: signToken(ins.rows[0].id), email: mail })
    }

    if (action === 'login') {
      if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })
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
