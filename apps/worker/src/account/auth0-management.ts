interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cached: CachedToken | undefined;

async function getToken(): Promise<string> {
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_M2M_CLIENT_ID;
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    throw new Error('إعداد Auth0 Management API ناقص — راجع docs/auth0-setup.md القسم 4');
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`تعذّر الحصول على رمز Management API (HTTP ${response.status})`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: body.access_token,
    expiresAtMs: Date.now() + Math.max(0, body.expires_in - 60) * 1000,
  };

  return cached.accessToken;
}

/**
 * يحذف الهوية من Auth0.
 *
 * 404 نجاح: الغاية أن تنتهي الهوية، وغيابها يحقق الغاية — وهذا ما
 * يجعل الخطوة قابلة لإعادة المحاولة بعد نجاح جزئي.
 */
export async function deleteAuth0User(auth0UserId: string): Promise<void> {
  const domain = process.env.AUTH0_DOMAIN!;
  const token = await getToken();

  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`فشل حذف الهوية من Auth0 (HTTP ${response.status}): ${body.slice(0, 200)}`);
  }
}
