import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassword, db, ensureSchema, fail, guard, hashPassword, signToken } from './_lib/core.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST { action: 'setup', email, code, password } (une seule fois) ou { action: 'login', email, password } */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST', false)) return
  try {
    await ensureSchema()
    const { action, password, code, email } = (req.body ?? {}) as { action?: string; password?: string; code?: string; email?: string }
    if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })
    const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    const user = await db().query('select pass_hash, email from app_user where id = 1')
    if (action === 'setup') {
      if (!EMAIL.test(mail)) return void res.status(400).json({ error: 'Adresse e-mail invalide' })
      if (user.rowCount) return void res.status(409).json({ error: 'Un compte existe déjà : connecte-toi' })
      if (!process.env.SETUP_CODE || code?.trim() !== process.env.SETUP_CODE) {
        await sleep(800)
        return void res.status(403).json({ error: 'Code d’installation incorrect' })
      }
      const ins = await db().query('insert into app_user (id, pass_hash, email) values (1, $1, $2) on conflict do nothing', [hashPassword(password), mail])
      if (!ins.rowCount) return void res.status(409).json({ error: 'Un compte existe déjà : connecte-toi' })
      return void res.json({ token: signToken(), email: mail })
    }
    if (action === 'login') {
      const row = user.rows[0]
      // L'e-mail est vérifié s'il a été enregistré (comptes créés avant l'ajout de l'e-mail : mot de passe seul).
      const ok = row && checkPassword(password, row.pass_hash) && (!row.email || row.email === mail)
      if (!ok) {
        await sleep(800)
        return void res.status(401).json({ error: user.rowCount ? 'E-mail ou mot de passe incorrect' : 'Aucun compte : crée-le d’abord (« Créer un compte »)' })
      }
      return void res.json({ token: signToken(), email: row.email ?? mail })
    }
    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    fail(res, e)
  }
}
