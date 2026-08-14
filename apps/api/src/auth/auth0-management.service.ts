import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * عميل Auth0 Management API.
 *
 * الاستخدام الوحيد حالياً: حذف المستخدم من Auth0 عند حذف الحساب.
 * الحذف يجب أن ينفَّذ على **الطرفين** — حذفه من قاعدة بياناتنا وحدها
 * يترك هويته قائمة لدى المزوّد، فيستطيع الدخول من جديد وتُنشأ له
 * مؤسسة جديدة وكأن الحذف لم يحدث (ADR-010).
 */
@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name);
  private cached?: CachedToken;

  /** هل أُعدّت بيانات M2M؟ يُستخدم لرفض الحذف مبكراً برسالة واضحة. */
  isConfigured(): boolean {
    return Boolean(
      process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_M2M_CLIENT_ID &&
      process.env.AUTH0_M2M_CLIENT_SECRET,
    );
  }

  /**
   * يحذف المستخدم من Auth0.
   *
   * يعامل 404 كنجاح: الغاية أن تنتهي الهوية، وغيابها أصلاً يحقق
   * الغاية. أي رمز آخر يُرمى ليعيد الطابور المحاولة.
   */
  async deleteUser(auth0UserId: string): Promise<void> {
    const domain = process.env.AUTH0_DOMAIN!;
    const token = await this.getToken();

    const response = await fetch(
      `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 404) {
      this.logger.warn('الهوية غير موجودة في Auth0 — تُعتبر محذوفة');
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`فشل حذف الهوية من Auth0 (HTTP ${response.status}): ${body.slice(0, 200)}`);
    }

    this.logger.log('حُذفت الهوية من Auth0');
  }

  /**
   * رمز Management API عبر client_credentials، مع تخزين مؤقت.
   * نطرح 60 ثانية من العمر تحسّباً لانحراف الساعة وزمن الشبكة.
   */
  private async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAtMs > Date.now()) {
      return this.cached.accessToken;
    }

    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'بيانات Auth0 Management API غير مُعدّة — راجع docs/auth0-setup.md القسم 4',
      );
    }

    const domain = process.env.AUTH0_DOMAIN!;
    const response = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.AUTH0_M2M_CLIENT_ID,
        client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
        audience: `https://${domain}/api/v2/`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`تعذّر الحصول على رمز Management API (HTTP ${response.status})`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };

    this.cached = {
      accessToken: body.access_token,
      expiresAtMs: Date.now() + Math.max(0, body.expires_in - 60) * 1000,
    };

    return this.cached.accessToken;
  }
}
