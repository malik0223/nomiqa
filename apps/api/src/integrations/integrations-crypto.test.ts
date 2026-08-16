import { WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS } from '@nomiqa/contracts';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, readApiKeyPrefix } from './api-key-token.js';
import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhook-signature.js';

describe('مفاتيح الـAPI', () => {
  it('يولّد مفتاحاً بثلاثة مقاطع وتجزئة مطابقة', () => {
    const key = generateApiKey();

    expect(key.token.startsWith('nmq_')).toBe(true);
    expect(key.token.split('_')).toHaveLength(3);
    expect(readApiKeyPrefix(key.token)).toBe(key.prefix);
    expect(hashApiKey(key.token)).toBe(key.tokenHash);
  });

  it('لا يكرّر مفتاحين', () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  /**
   * البادئة تُقرأ بلا استعلام.
   *
   * هذا ما يمنع مسار المفتاح من أن يصير قناةً لإغراق قاعدة البيانات:
   * كل نص لا يطابق الشكل يُرفض قبل أن يلمس أي جدول.
   */
  it('يرفض الأشكال غير الصالحة قبل أي استعلام', () => {
    for (const invalid of [
      '',
      'nmq_short_x',
      'other_abcdefgh_0123456789012345678901234567890123',
      'nmq_abcdefgh',
      'nmq_abcdefgh_tooshort',
    ]) {
      expect(readApiKeyPrefix(invalid)).toBeNull();
    }
  });
});

describe('توقيع Webhook', () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ type: 'contact.captured', data: { id: 'c1' } });

  it('يقبل توقيعاً صحيحاً داخل النافذة', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(secret, timestamp, body);

    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        body,
        signature,
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
      ),
    ).toBe(true);
  });

  it('يرفض جسماً عُدّل بعد التوقيع', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(secret, timestamp, body);

    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        `${body} `,
        signature,
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
      ),
    ).toBe(false);
  });

  /**
   * الطابع داخل المُوقَّع لا بجانبه.
   *
   * لولا ذلك لبقي كل تسليم صالحاً إلى الأبد: من التقط نداءً قديماً
   * أعاد إرساله بعد شهر فيُقبل — وهو **إعادة تشغيل** لا تزوير، ولا
   * يمنعها التوقيع وحده.
   */
  it('يرفض توقيعاً خارج النافذة الزمنية', () => {
    const stale = Math.floor(Date.now() / 1000) - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS - 60;
    const signature = signWebhookPayload(secret, stale, body);

    expect(
      verifyWebhookSignature(secret, stale, body, signature, WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS),
    ).toBe(false);
  });

  it('يرفض توقيعاً بسرّ آخر', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(generateWebhookSecret(), timestamp, body);

    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        body,
        signature,
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
      ),
    ).toBe(false);
  });

  it('يرفض توقيعاً بطول مختلف بلا أن يرمي', () => {
    const timestamp = Math.floor(Date.now() / 1000);

    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        body,
        'deadbeef',
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
      ),
    ).toBe(false);
  });
});
