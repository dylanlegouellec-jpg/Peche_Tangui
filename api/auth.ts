import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassword, db, ensureSchema, fail, guard, hashPassword, signToken } from './_lib/core.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** POST { action: 'setup', code, password } (une seule fois) ou { action: 'login', password } */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'POST', false)) return
  try {
    await ensureSchema()
    const { action, password, code } = (req.body ?? {}) as { action?: string; password?: string; code?: string }
    if (typeof password !== 'string' || password.length < 8) return void res.status(400).json({ error: 'Mot de passe de 8 caractères minimum' })

    const user = await db().query('select pass_hash from app_user where id = 1')
    if (action === 'setup') {
      if (user.rowCount) return void res.status(409).json({ error: 'Compte déjà créé : connecte-toi' })
      if (!process.env.SETUP_CODE || code !== process.env.SETUP_CODE) {
        await sleep(800)
        return void res.status(403).json({ error: 'Code d’installation incorrect' })
      }
      const ins = await db().query('insert into app_user (id, pass_hash) values (1, $1) on conflict do nothing', [hashPassword(password)])
      if (!ins.rowCount) return void res.status(409).json({ error: 'Compte déjà créé : connecte-toi' })
      return void res.json({ token: signToken() })
    }
    if (action === 'login') {
      if (!user.rowCount || !checkPassword(password, user.rows[0].pass_hash)) {
        await sleep(800)
        return void res.status(401).json({ error: 'Mot de passe incorrect' })
      }
      return void res.json({ token: signToken() })
    }
    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    fail(res, e)
  }
}
