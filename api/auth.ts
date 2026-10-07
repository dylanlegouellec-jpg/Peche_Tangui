import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassword, db, ensureSchema, fail, guard, hashCode, hashPassword, signToken } from './_lib/core.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Codes d'installation valables : SETUP_CODE, un ou plusieurs codes séparés par des virgules. Chaque code ne sert qu'à créer un seul compte. */
const codes = () => (process.env.SETUP_CODE ?? '').split(',').map((c) => c.trim()).filter(Boolean)

/** POST { action: 'setup', email, code, password } (un code = un compte) ou { action: 'login', email, password } */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST', false)) return
  try {
    await ensureSchema()
    const { action, password, code, email } = (req.body ?? {}) as { action?: string; password?: string; code?: string; email?: string }
    if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })
    const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (action === 'setup') {
      if (!EMAIL.test(mail)) return void res.status(400).json({ error: 'Adresse e-mail invalide' })
      const given = code?.trim() ?? ''
      if (!given || !codes().includes(given)) {
        await sleep(800)
        return void res.status(403).json({ error: 'Code d’installation incorrect' })
      }
      if ((await db().query('select 1 from users where code_hash = $1', [hashCode(given)])).rowCount) return void res.status(403).json({ error: 'Ce code a déjà servi à créer un compte' })
      if ((await db().query('select 1 from users where email = $1', [mail])).rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      const ins = await db().query('insert into users (email, pass_hash, code_hash) values ($1, $2, $3) on conflict do nothing returning id', [mail, hashPassword(password), hashCode(given)])
      if (!ins.rowCount) return void res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail : connecte-toi' })
      return void res.json({ token: signToken(ins.rows[0].id), email: mail })
    }
    if (action === 'login') {
      // Compte trouvé par e-mail ; les comptes créés avant l'ajout de l'e-mail n'en ont pas : mot de passe seul.
      const found = await db().query('select id, pass_hash, email from users where email = $1 or email is null order by email is null limit 1', [mail])
      const row = found.rows[0]
      if (!row || !checkPassword(password, row.pass_hash)) {
        await sleep(800)
        const any = await db().query('select 1 from users limit 1')
        return void res.status(401).json({ error: any.rowCount ? 'E-mail ou mot de passe incorrect' : 'Aucun compte : crée-le d’abord (« Créer un compte »)' })
      }
      return void res.json({ token: signToken(row.id), email: row.email ?? mail })
    }
    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    fail(res, e)
  }
}
