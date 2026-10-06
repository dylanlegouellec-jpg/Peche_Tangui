import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, ensureSchema, fail, guard } from './_lib/core.js'

/** Diagnostic sans secret : la configuration est-elle complète ? */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'GET', false)) return
  try {
    await ensureSchema()
    const u = await db().query('select 1 from app_user where id = 1')
    res.json({
      database: true,
      jwtSecret: (process.env.JWT_SECRET?.length ?? 0) >= 16,
      setupCode: !!process.env.SETUP_CODE,
      accountExists: !!u.rowCount,
    })
  } catch (e) {
    fail(res, e)
  }
}
