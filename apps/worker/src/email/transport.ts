import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | undefined;

/**
 * ناقل SMTP مشترك.
 *
 * محلياً يشير إلى Mailpit فلا يغادر أي بريد الجهاز — إرسال رسائل
 * حقيقية أثناء التطوير خطر على المستخدمين الحقيقيين وعلى سمعة النطاق.
 */
export function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 1025);

    if (!host) {
      throw new Error('SMTP_HOST مطلوب لإرسال البريد');
    }

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    transporter = nodemailer.createTransport({
      host,
      port,
      // Mailpit محلياً بلا TLS؛ الإنتاج يستخدم 465 أو STARTTLS على 587.
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  return transporter;
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? 'Nomiqa <no-reply@nomiqa.local>';
}

export async function closeTransporter(): Promise<void> {
  transporter?.close();
  transporter = undefined;
}
