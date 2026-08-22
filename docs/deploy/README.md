# Nomiqa — Production Deployment Runbook

How to take Nomiqa live: **Netlify** (web) + **Supabase** (Postgres + storage) +
**Railway** (API + worker + Redis) + **Auth0** (identity).

> Netlify hosts only `apps/web`. The NestJS API (`apps/api`) and the worker
> (`apps/worker`) are persistent Node processes and **cannot** run on Netlify —
> they run on Railway alongside a managed Redis. The web app talks to the API
> over HTTPS (`NEXT_PUBLIC_API_URL`); it never touches the database directly.

```
Browser ──► Netlify (apps/web, Next.js) ──HTTPS──► Railway (apps/api, NestJS)
                                                      │        │
                                                      │        ├──► Supabase Postgres
                                                      │        └──► Supabase Storage (S3)
                                                      ▼
                                              Railway Redis ◄── Railway (apps/worker)
```

---

## 0. Project facts (already provisioned)

| Thing | Value |
| --- | --- |
| Supabase project | **Nomiqa** (org: Personal) |
| Project ref | `aedsbgaamdikokctunim` |
| Region | `ap-southeast-1` (Singapore) |
| Supabase URL | `https://aedsbgaamdikokctunim.supabase.co` |
| Direct DB host | `db.aedsbgaamdikokctunim.supabase.co` |
| Storage S3 endpoint | `https://aedsbgaamdikokctunim.storage.supabase.co/storage/v1/s3` |

Deploy **Railway in Singapore too**, to co-locate the API with the database.

---

## 1. Supabase — database

### 1.1 Get a database password you control
The project was created with an auto-generated password. Reset it so you have a
known value:

**Dashboard → Project Settings → Database → Reset database password.** Copy the
new password somewhere safe — you'll paste it into the two URLs below.

### 1.2 Copy the connection strings
**Dashboard → Connect (top bar) → ORMs / Prisma**, and use the **Session pooler**
(port **5432**) for both:

- **`DATABASE_URL`** — the *Session pooler* URI (port **5432**), no `pgbouncer`
  flag. Used by the API/worker at runtime.
- **`DIRECT_URL`** — the *Session pooler* URI too (port **5432**). Used by Prisma
  migrations.

> **Do NOT use the transaction pooler (port 6543) for `DATABASE_URL` here.** It is
> built for serverless/edge and does a fresh connection assignment per query — on
> a persistent server (Railway) that adds ~700 ms to *every* query and causes
> dashboard timeouts. The session pooler keeps warm connections. (The direct
> connection `db.<ref>.supabase.co:5432` is faster still but is IPv6-only, so it
> needs Railway IPv6 egress enabled.)

They look like this (copy the exact host from the dashboard — the `aws-0` vs
`aws-1` prefix varies):

```
# Runtime (API + worker) — the RLS-respecting role created in 1.3.
DATABASE_URL=postgresql://nomiqa_app.aedsbgaamdikokctunim:APP-ROLE-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
# Migrations only — needs owner/DDL rights.
DIRECT_URL=postgresql://postgres.aedsbgaamdikokctunim:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

> **Two things the pooler is strict about — both fail confusingly:**
>
> 1. **Append the project ref to the username**: `nomiqa_app.<project-ref>`, not a
>    bare `nomiqa_app`. The pooler routes by that suffix, and without it every
>    connection dies at boot with
>    `FATAL: (ENOIDENTIFIER) no tenant identifier provided` — which reads like a
>    multi-tenancy bug in the app, not a username format problem. (A direct,
>    non-pooler connection takes the bare role name instead.)
> 2. **Percent-encode special characters** in the password (`@`->`%40`,
>    `#`->`%23`, `!`->`%21`, `$`->`%24`), or the parser reads the first `@` as the
>    host separator and mangles the URL. Generate the encoded form with:
>    `node -e "console.log(encodeURIComponent('YOUR-PASSWORD'))"`
>
> The user in `DATABASE_URL` is the `nomiqa_app` role (see 1.3), **not**
> `postgres` — that is what enforces tenant isolation.

Also make sure the Railway services run in the **same region as Supabase**
(Singapore / `ap-southeast-1` here) — each service → Settings → Regions.

The Prisma datasource (`packages/database/prisma/schema.prisma`) already reads
both.

### 1.3 Create the RLS-respecting app role ⚠️ (isolation depends on this)
**Do not run the app as Supabase's `postgres` role.**

Tenant isolation in this codebase is enforced by **PostgreSQL RLS**: repository
queries such as `CardsService.list()` deliberately carry no `organization_id`
filter and instead run inside `withRlsContext(...)`, which sets
`app.organization_id` so the policies filter the rows.

Supabase's default `postgres` role has **`BYPASSRLS = true`**, which makes every
policy inert (`FORCE ROW LEVEL SECURITY` does *not* override `BYPASSRLS`). Running
the API as `postgres` therefore returns **every organization's rows to every
user** — a full cross-tenant data leak, with no error anywhere.

In **Dashboard → SQL Editor**, create a dedicated role that respects RLS:

```sql
-- 1. The runtime role. NOBYPASSRLS is the whole point.
CREATE ROLE nomiqa_app WITH LOGIN PASSWORD 'YOUR-STRONG-PASSWORD' NOBYPASSRLS;

-- 2. Privileges (plus defaults, so tables from future migrations are covered).
GRANT USAGE ON SCHEMA public TO nomiqa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nomiqa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nomiqa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO nomiqa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nomiqa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nomiqa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO nomiqa_app;
```

Then allow the role full access to the **global/reference tables** — the ones with
no `organization_id`, which have RLS enabled but no tenant policy. Without this the
API cannot read templates, plans or users and fails to boot:

```sql
CREATE POLICY nomiqa_app_full ON public.users                  FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.organizations          FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.roles                  FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.permissions            FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.role_permissions       FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.membership_roles       FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.platform_admins        FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.platform_audit_logs    FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.feature_flags          FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.feature_flag_overrides FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.templates              FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.template_versions      FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.plans                  FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.plan_prices            FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.payment_events         FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public.coupons                FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
CREATE POLICY nomiqa_app_full ON public._prisma_migrations     FOR ALL TO nomiqa_app USING (true) WITH CHECK (true);
```

Which URL uses which role:

| Variable | Role | Why |
| --- | --- | --- |
| `DATABASE_URL` (API + worker runtime) | **`nomiqa_app`** | respects RLS — this is what isolates tenants |
| `DIRECT_URL` (Prisma migrations) | `postgres` | migrations need owner/DDL rights |

**Verify isolation after any change to this** — with two orgs where only the first
owns a card, the second must see zero:

```sql
SET ROLE nomiqa_app;
SELECT set_config('app.organization_id', '<ORG-WITHOUT-CARDS>', false);
SELECT count(*) FROM cards WHERE deleted_at IS NULL;  -- must be 0
RESET ROLE;
```

### 1.4 Storage buckets
**Dashboard → Storage → New bucket**, create two:

| Bucket | Public? | Purpose |
| --- | --- | --- |
| `nomiqa` | **Private** | private org media (`S3_BUCKET`) |
| `nomiqa-public` | **Public** | published-card images (`S3_PUBLIC_BUCKET`) |

Then **Project Settings → Storage → S3 access keys → New access key**. Copy the
access key id + secret into `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.

Supabase Storage speaks the S3 protocol in **path style**, so keep
`S3_FORCE_PATH_STYLE=true`.

---

## 2. Auth0 — identity

You need an **API** and a **Regular Web Application** in your production tenant.

1. **APIs → Create API.** Identifier (audience) e.g. `https://api.nomiqa.om`.
   This value goes into `AUTH0_AUDIENCE` (web *and* API must match).
2. **Applications → Create → Regular Web Application** for the Next.js site.
   From its **Settings** tab copy Domain, Client ID, Client Secret.
3. In that app's settings, set (replace with your Netlify URL):
   - **Allowed Callback URLs:** `https://YOUR-SITE.netlify.app/auth/callback`
   - **Allowed Logout URLs:** `https://YOUR-SITE.netlify.app`
   - **Allowed Web Origins:** `https://YOUR-SITE.netlify.app`
4. (Optional, for account deletion) **Applications → Create → Machine to
   Machine**, authorize the **Auth0 Management API** with `delete:users`. Copy
   its Client ID/Secret into `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`
   on the API service.

Generate the Next.js session secret:

```bash
openssl rand -hex 32
```

---

## 3. Railway — API + worker + Redis

Create one Railway **project** with three services, all from this GitHub repo.
For each service set **Root Directory = `/`** (so the pnpm workspace resolves).

### 3.1 Redis
**New → Database → Redis.** Railway exposes it as `${{Redis.REDIS_URL}}` — you'll
reference that from the other two services.

### 3.2 API service (`apps/api`)
- **Build command:** `pnpm turbo run build --filter=@nomiqa/api...`
- **Pre-deploy command** (runs migrations once per deploy):
  `pnpm --filter @nomiqa/database exec prisma migrate deploy`
- **Start command:** `node apps/api/dist/main.js`
- **Networking → target port: `8080`** (matches `API_PORT` below), then generate
  a public domain. That HTTPS domain is your `NEXT_PUBLIC_API_URL`.

> Why the fixed port: `apps/api/src/main.ts` listens on `API_PORT` (not Railway's
> `PORT`), so we pin both to `8080`.

### 3.3 Worker service (`apps/worker`)
- **Build command:** `pnpm turbo run build --filter=@nomiqa/worker...`
- **Start command:** `node apps/worker/dist/main.js`
- No web port, no migrations.

### 3.4 Environment variables

**API service:**

| Var | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_PORT` | `8080` |
| `DATABASE_URL` | Supabase transaction pooler (§1.2) |
| `DIRECT_URL` | Supabase session pooler (§1.2) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `CORS_ORIGINS` | `https://YOUR-SITE.netlify.app` (comma-separate extra domains) |
| `APP_BASE_URL` | `https://YOUR-SITE.netlify.app` |
| `AUTH0_DOMAIN` | your tenant domain |
| `AUTH0_ISSUER_BASE_URL` | `https://<tenant>/` |
| `AUTH0_AUDIENCE` | e.g. `https://api.nomiqa.om` |
| `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET` | optional (account deletion) |
| `S3_ENDPOINT` | `https://aedsbgaamdikokctunim.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | `ap-southeast-1` |
| `S3_BUCKET` | `nomiqa` |
| `S3_PUBLIC_BUCKET` | `nomiqa-public` |
| `S3_PUBLIC_BASE_URL` | `https://aedsbgaamdikokctunim.storage.supabase.co/storage/v1/object/public/nomiqa-public` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Supabase S3 keys (§1.3) |
| `S3_FORCE_PATH_STYLE` | `true` |
| `ANALYTICS_VISITOR_SECRET` | **required** — `openssl rand -hex 32` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | your email provider |
| `MAIL_FROM` | e.g. `Nomiqa <no-reply@nomiqa.om>` |
| `SENTRY_DSN` | optional |

> **`CORS_ORIGINS` is mandatory.** Without it the API defaults to
> `http://localhost:3000` and rejects every request from the Netlify site.

**Worker service:** the same `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, all
`S3_*`, `SMTP_*`, `MAIL_FROM`, `APP_BASE_URL`, `SENTRY_DSN`. (No Auth0/CORS/port.)

### 3.5 Seed the reference data (once)
After the first API deploy runs the migrations, seed roles/permissions/plans.
From Railway's API service shell (or locally with prod env vars exported):

```bash
NODE_ENV=production pnpm --filter @nomiqa/database exec tsx prisma/seed.ts
```

Safe in production: the seed upserts (won't overwrite prices you later change),
and the demo card is gated behind `NODE_ENV=development`, so it is skipped.

---

## 4. Netlify — web

1. **Add new site → Import from Git**, pick this repo.
2. Netlify reads `netlify.toml` at the repo root — build command, publish dir
   (`apps/web/.next`) and the Next.js runtime plugin are already configured. Leave
   the base directory empty (build runs from the repo root so pnpm resolves the
   workspace).
3. **Site settings → Environment variables:**

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | your Railway API domain, e.g. `https://nomiqa-api.up.railway.app` |
| `APP_BASE_URL` | your Netlify site URL |
| `AUTH0_DOMAIN` | your tenant domain |
| `AUTH0_CLIENT_ID` | web app Client ID |
| `AUTH0_CLIENT_SECRET` | web app Client Secret |
| `AUTH0_SECRET` | `openssl rand -hex 32` |
| `AUTH0_AUDIENCE` | same as the API, e.g. `https://api.nomiqa.om` |

> `NEXT_PUBLIC_API_URL` is inlined into the bundle **at build time** — after you
> change it you must trigger a redeploy, not just restart.

4. **Deploy.** Once you have the final `*.netlify.app` URL, go back and fill the
   real value into: Auth0 callback/logout/origins (§2.3), Railway `CORS_ORIGINS`
   and `APP_BASE_URL` (§3.4), and Netlify `APP_BASE_URL`. Redeploy the site so the
   inlined values are correct.

---

## 5. Go-live checklist

- [ ] Supabase DB password reset; `DATABASE_URL` + `DIRECT_URL` copied.
- [ ] `nomiqa_app` role created (NOBYPASSRLS) + grants + reference-table policies (1.3).
- [ ] Isolation verified: a second org sees 0 cards belonging to the first.
- [ ] Buckets `nomiqa` (private) + `nomiqa-public` (public) created; S3 keys issued.
- [ ] Auth0 API + Web App created; callback/logout/origin URLs set to the Netlify domain.
- [ ] Railway: Redis up; API service (migrations green in deploy logs); worker service running.
- [ ] Reference data seeded (`4 plans`, roles, permissions).
- [ ] Netlify site deployed; env vars set; `NEXT_PUBLIC_API_URL` points at Railway.
- [ ] `CORS_ORIGINS` on the API = the Netlify domain.
- [ ] Smoke test: open the site → **Sign in** (Auth0) → land on the dashboard →
      create and publish a card → open its public URL → submit the contact form.

---

## 6. Troubleshooting

Symptoms this deployment actually hit, and what each one means:

| Symptom | Cause |
| --- | --- |
| `FATAL: (ENOIDENTIFIER) no tenant identifier provided` at API boot | Pooler username missing the project ref — use `role.<project-ref>` (1.2) |
| A user sees another organization's cards/contacts | Runtime DB role has `BYPASSRLS` — must be `nomiqa_app` (1.3) |
| Dashboard "something went wrong", clears on refresh | Transaction pooler (6543) on `DATABASE_URL`; use the session pooler (1.2) |
| `Cannot find name 'process' / 'URL'` in a Netlify/Railway build | Package uses Node globals without declaring `@types/node` |
| `@prisma/client did not initialize yet` at container start | Runtime image lacks the generated client — services run `prisma generate` on start |
| `Domain resolver threw an error` (500, text/plain) on every page | Netlify edge function crashed — usually missing `AUTH0_*` env vars |
| Login returns `invalid_request` | Auth0 app not authorized on the API — see `docs/auth0-setup.md` §3.1 |
| "الرمز لا يحتوي على بريد إلكتروني" after login | No post-login Action adding `email` to the access token — `docs/auth0-setup.md` §3.2 |
| BullMQ cannot reach Redis on Railway | ioredis needs `family: 0` (Railway private network is IPv6-only) |

---

## What can wait
These degrade gracefully — the app runs without them and shows a clear disabled
state:

- **SMTP** — invitation/notification emails (worker). Set before inviting teammates.
- **Thawani** (`THAWANI_*`) — only needed to charge for paid plans.
- **Apple/Google Wallet**, **OCR** (`OCR_PROVIDER`) — optional feature keys; see
  `.env.example` and the relevant `docs/adr/*`.
