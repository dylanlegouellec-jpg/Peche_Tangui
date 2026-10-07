import nodemailer from 'nodemailer'

/** Envoi d'e-mails par Gmail (gratuit, 500 par jour) avec un mot de passe d'application : variables GMAIL_USER et GMAIL_APP_PASSWORD. */
export const mailConfigured = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || !!process.env.MAIL_DRY_RUN

export async function sendMail(to: string, subject: string, text: string) {
  // Mode essai (tests locaux uniquement) : le message est gardé en mémoire au lieu d'être envoyé.
  if (process.env.MAIL_DRY_RUN) {
    ;(globalThis as { __lastMail?: unknown }).__lastMail = { to, subject, text }
    return
  }
  const user = process.env.GMAIL_USER!.trim()
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, '') } })
  await transport.sendMail({ from: `Appli pêche <${user}>`, to, subject, text })
}
