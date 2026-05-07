# Deploy guide — Vercel + Fly.io + Neon + R2

This is the recommended path. The web app runs on Vercel, the PDF
worker (Puppeteer) runs on Fly.io, the database is Neon Postgres, and
image uploads land in Cloudflare R2 (S3-compatible).

The order matters: DB → worker → uploads → web. Each later step needs
URLs / secrets minted by the earlier ones.

> **You'll run all the commands.** This guide assumes `flyctl`,
> `vercel`, and `psql` are installed locally and you're authenticated
> against each service.

---

## 0. Prerequisites

```bash
# Tooling
brew install flyctl vercel-cli postgresql
corepack enable           # for pnpm
pnpm install              # in repo root
```

Generate two secrets and keep them somewhere private — you'll paste
them into multiple dashboards:

```bash
SESSION_SECRET=$(openssl rand -hex 32)        # signs the device cookie
WORKER_SHARED_SECRET=$(openssl rand -hex 32)  # auth between web and worker
```

---

## 1. Postgres on Neon

1. Create a project at <https://neon.tech>. Pick a region close to your
   worker (e.g. `ap-southeast-1` if the worker is on Fly `sin`).
2. Create a database called `cheatsheet`.
3. Copy the **pooled** connection string from the dashboard
   (`postgresql://<user>:<pwd>@<endpoint>/cheatsheet?sslmode=require`).
4. Apply migrations from your laptop:

   ```bash
   DATABASE_URL='postgresql://...' pnpm db:migrate
   ```

   You should see `migrations applied`. Repeat after every
   `pnpm db:generate` change.

---

## 2. PDF worker on Fly.io

```bash
# 2.1. Create the app (name must be globally unique).
flyctl apps create cheatsheet-worker-<your-suffix>

# 2.2. Edit apps/worker/fly.toml so `app = "cheatsheet-worker-<your-suffix>"`.

# 2.3. Set the secrets the worker needs.
flyctl secrets set --app cheatsheet-worker-<your-suffix> \
  DATABASE_URL='postgresql://...neon...' \
  WORKER_SHARED_SECRET="$WORKER_SHARED_SECRET" \
  APP_URL='https://placeholder.vercel.app'   # update after step 4

# 2.4. Deploy. --remote-only builds on Fly's builders (no local Docker).
flyctl deploy --config apps/worker/fly.toml \
  --dockerfile apps/worker/Dockerfile \
  --remote-only

# 2.5. Note the public URL.
flyctl status --app cheatsheet-worker-<your-suffix>
# → https://cheatsheet-worker-<your-suffix>.fly.dev

# 2.6. Sanity-check the health endpoint.
curl https://cheatsheet-worker-<your-suffix>.fly.dev/healthz
# → {"ok":true}
```

The worker now answers `/render` (with a `Bearer $WORKER_SHARED_SECRET`
auth header) and `/healthz` (open). Fly auto-stops idle machines; the
first export after a quiet period takes ~3 s of cold start.

### Re-deploy

```bash
flyctl deploy --config apps/worker/fly.toml \
  --dockerfile apps/worker/Dockerfile --remote-only
```

### Tail logs

```bash
flyctl logs --app cheatsheet-worker-<your-suffix>
```

The worker emits one JSON object per line (see ADR-009), so
`flyctl logs | jq` is your friend.

---

## 3. Image uploads on Cloudflare R2

R2 is S3-compatible and has a generous free tier (10 GB stored,
1 M Class-A ops/month).

1. **Create a bucket** at <https://dash.cloudflare.com> →
   R2 → "Create bucket". Name: `cheatsheet-uploads`. Location: `APAC`.
2. **Enable a public URL** for the bucket (Settings → "Public access" →
   "Allow Access"). Copy the public URL — looks like
   `https://pub-<hash>.r2.dev`.
3. **Mint API tokens** at R2 → "Manage R2 API Tokens" → "Create API token".
   - Permission: **Object Read & Write**.
   - Specify `cheatsheet-uploads` only.
   - Save the Access Key ID and Secret Access Key.
4. Note the S3 endpoint shown on the token page — looks like
   `https://<account>.r2.cloudflarestorage.com`.

You'll plug these into Vercel in the next step:

| Var | Example |
| --- | --- |
| `S3_ENDPOINT`          | `https://<account>.r2.cloudflarestorage.com` |
| `S3_BUCKET`            | `cheatsheet-uploads` |
| `S3_REGION`            | `auto` |
| `S3_ACCESS_KEY_ID`     | `<from token>` |
| `S3_SECRET_ACCESS_KEY` | `<from token>` |
| `S3_PUBLIC_URL`        | `https://pub-<hash>.r2.dev` |

> **Skip this step?** If you don't set `S3_BUCKET`, uploads fall back
> to the local filesystem — which is *ephemeral* on Vercel (every
> deploy and every cold start wipes it). Only do that for a demo.

---

## 4. Web app on Vercel

```bash
# 4.1. From the repo root. Pick the existing personal/team scope.
vercel link

# 4.2. Set production env vars. Run each in the repo root.
vercel env add DATABASE_URL              production
vercel env add SESSION_SECRET            production   # paste $SESSION_SECRET
vercel env add WORKER_SHARED_SECRET      production   # paste $WORKER_SHARED_SECRET
vercel env add WORKER_URL                production   # https://cheatsheet-worker-...fly.dev
vercel env add ANTHROPIC_API_KEY         production   # optional; enables /api/extract
vercel env add S3_ENDPOINT               production
vercel env add S3_BUCKET                 production
vercel env add S3_REGION                 production
vercel env add S3_ACCESS_KEY_ID          production
vercel env add S3_SECRET_ACCESS_KEY      production
vercel env add S3_PUBLIC_URL             production
# APP_URL is added in step 4.4 once we know the Vercel domain.

# 4.3. Deploy.
vercel --prod

# 4.4. Note the production URL (e.g. https://a4papr.vercel.app).
#      Set it on BOTH services so:
#      - Vercel sees its own canonical APP_URL (used for CSRF + magic-link);
#      - the worker can browse to /print/:id during renders.
vercel env add APP_URL production       # paste the Vercel URL
flyctl secrets set --app cheatsheet-worker-<your-suffix> \
  APP_URL=https://a4papr.vercel.app

# 4.5. Re-deploy web with the right APP_URL.
vercel --prod
```

That's it. Smoke test:

```bash
# Health
curl https://a4papr.vercel.app/api/healthz
# → {"ok":true,"db":"up"}

# Land on the editor (sets the device cookie)
open https://a4papr.vercel.app
```

Create a block, drop it on the canvas, hit **Export PDF** — the PDF
should download. If it doesn't, see "Troubleshooting" below.

---

## 5. Hooking up backups (recommended for production)

The DB is on Neon, which has its own automatic backups (point-in-time
recovery on the paid plan; daily snapshots on free). For belt-and-braces
local copies, run `scripts/backup.sh` from cron:

```cron
# /etc/cron.d/cheatsheet-backup
0 */6 * * * deploy DATABASE_URL='postgresql://...' BACKUP_DIR=/var/backups/cheatsheet /opt/A4Papr/scripts/backup.sh
```

ADR-010 captures the full reasoning + non-goals.

---

## Troubleshooting

### "Export PDF" returns 502

Almost always one of:
- `WORKER_URL` on Vercel doesn't match the Fly app's URL.
- `WORKER_SHARED_SECRET` is different on the two sides — they must
  match exactly. Re-set on whichever side is wrong, then redeploy.
- Worker can't reach the web app (`APP_URL` wrong on the worker).
  Check `flyctl logs` for `render failed`.

### "Export PDF" returns 504

The render exceeded `RENDER_TIMEOUT_MS` (45 s default). Likely causes:
- A KaTeX formula loops forever (check the source LaTeX).
- The worker is OOM-killed and restarting. Bump `vm.memory_mb` in
  `fly.toml` to 2048 and redeploy.

### Image upload returns 500 with "S3 PUT 403 Forbidden"

The R2 token doesn't have `Object Read & Write` on this bucket, OR
`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` were swapped. Mint a fresh
token, re-set both on Vercel.

### Magic link e-mail "doesn't arrive"

There is no SMTP. Magic links are logged to stderr (visible in
`vercel logs --prod`). Production-readying this is a single-function
swap of `stderrDelivery` in `apps/web/src/lib/auth-claim.ts`.

### "I cleared my cookie and lost my library"

That's why the magic-link claim flow exists (toolbar → "Save library").
ADR-007 explains the model.

---

## Cost notes

At zero or trivial traffic:

| Service     | Free tier covers                                              | Paid trigger |
| ----------- | ------------------------------------------------------------- | ------------ |
| Vercel      | 100 GB-bandwidth/mo, 6k function-mins                         | over 100 GB / commercial use |
| Fly.io      | shared-cpu-1x VMs in 3 regions until $5 of usage              | beyond ~750 hrs of single-cpu instances |
| Neon        | 0.5 GB storage, 1 endpoint, autosuspend after 5 min inactive  | over 0.5 GB or always-on |
| R2          | 10 GB storage, 1 M Class-A / 10 M Class-B ops/mo              | egress over the included free tier |
| Anthropic   | pay-as-you-go (no free tier)                                  | every API call |

Total at MVP traffic: **$0** apart from Anthropic, which you can keep
under SGD $5/month by leaving `ANTHROPIC_API_KEY` unset for end users
who haven't asked for AI extraction. Keep an eye on the `ai_usage`
table; it tracks every call by device.
