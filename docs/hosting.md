# Hosting AstroPilot (moving off Replit)

AstroPilot runs for free on two services:

- **[Render](https://render.com)** runs the web app ([`render.yaml`](../render.yaml)). Every push to `main`
  on GitHub deploys automatically, so changes go live a few minutes after they're pushed.
- **[Neon](https://neon.com)** hosts the Postgres database, photos included (table `photo_blobs`).

The app also builds as a container ([`Dockerfile`](../Dockerfile)) if you ever want another host.

## What "free" means here

| | Free limit | What happens at the limit |
|---|---|---|
| Render web service | Sleeps after 15 min without visitors; waking takes about a minute. 750 instance-hours a month (enough for one service running all month). 5 GB/month outbound traffic. | Extra traffic costs $0.15/GB (needs a card); after 750 h the service pauses until the next month. |
| Neon database | 0.5 GB storage, 100 compute-hours a month; sleeps after 5 min idle (first request after that waits ~1 s). 6-hour restore history. | Compute pauses until the next month. |

Photos are resized in the browser before upload (2400 px, high-quality JPEG — usually 0.3–1 MB), so
0.5 GB holds the journal plus several hundred photos.

**Keeping it awake (optional):** a free uptime monitor (e.g. UptimeRobot or cron-job.org) requesting
`https://astropilot.space/api/health` every 10 minutes stops the app from sleeping. That address
doesn't touch the database, so Neon still sleeps when nobody is using the site.

**When you outgrow it:** change `plan: free` to `plan: starter` in `render.yaml` (always on, about
$7/month), and/or move Neon to a paid plan. Nothing else changes.

## One-time move from Replit (about 30–45 minutes)

You need: the AstroPilot Repl on Replit, access to the DNS settings of astropilot.space (where the
domain is registered) and, for donations, your Stripe dashboard.

### 1. Create the database on Neon

1. Sign up at [neon.com](https://neon.com) (no card needed) and create a project named `astropilot`,
   PostgreSQL 16, region **AWS Europe (Frankfurt)**.
2. Open **Connect** and copy the connection string with *Connection pooling* **off** (the one without
   `-pooler` in the host name). It looks like `postgresql://…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require`.

### 2. Copy your data (users, logins, locations, gear, journal, photos)

In Replit → the AstroPilot Repl → **Shell**, run (paste the Neon string between the quotes):

```bash
NEW_DATABASE_URL='paste-the-neon-connection-string-here' bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/move-off-replit.sh)
```

It copies the photos from Replit storage into the database, copies the whole database to Neon, and
prints the row counts on both sides. It never changes anything on Replit.

### 3. Create the app on Render

1. Sign in at [render.com](https://render.com) with the GitHub account **hkaldis**.
2. **New → Blueprint**, pick the repository **hkaldis/astropilot**, and apply it. Render asks for:
   - `DATABASE_URL` — the Neon connection string from step 1;
   - `SESSION_SECRET` — copy it from **Replit → Secrets** (the *same* value keeps everyone signed in);
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — the same values as in Replit's Secrets;
   - `STRIPE_SECRET_KEY` — optional, for donations: Stripe Dashboard → Developers → API keys →
     Secret key. Leave it empty and the Support page simply hides donations.
3. The first deploy builds and starts the app on your data.

### 4. Try it on the Render address

Open the address shown at the top of the `astropilot` service (e.g. `https://astropilot.onrender.com`)
and sign in with your email and password. Google sign-in works there only if you add
`https://astropilot.onrender.com/api/auth/google/callback` to the OAuth client's *Authorized redirect
URIs* (Google Cloud Console → APIs & Services → Credentials) — optional; astropilot.space needs no change.

### 5. Switch astropilot.space

1. Right before switching, run the command from step 2 again so anything logged in the meantime comes
   across too (it replaces the copy on Neon), then **Manual Deploy → Restart service** on Render.
2. Render → **astropilot → Settings → Custom Domains**: add `astropilot.space` and `www.astropilot.space`.
   Render shows the DNS records to use.
3. Replit → **Deployments → Settings**: remove the custom domain.
4. At your domain registrar, replace the Replit DNS records with Render's. The switch takes from a few
   minutes to a few hours; Render issues the HTTPS certificate itself.
   (If the domain was bought through Replit, transfer it to a registrar first.)

### 6. Check, then switch Replit off

On https://astropilot.space: sign in with Google, open your journal, a photo and the Achievements page.
When everything looks right, stop the Replit deployment (Replit → Deployments → shut down). Keep the
Repl for a few weeks as a fallback, then delete it.

## After the move

- **Deploys:** push to `main` → Render builds and deploys (watch it under the service's *Events*).
  The database is upgraded automatically and additively on start (`server/migrate.ts`).
- **Logs:** the Render service's *Logs* tab. **Database usage:** the Neon project's dashboard.
- **Environment:** `DATABASE_URL`, `SESSION_SECRET` (required); `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  (Google sign-in); `STRIPE_SECRET_KEY` (donations); `APP_URL` (public address, for Stripe return links);
  `PHOTO_STORAGE` (`db`, default; `replit` only on Replit).
