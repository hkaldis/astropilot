# Hosting AstroPilot (moving off Replit)

AstroPilot runs on [Render](https://render.com): one web service and one Postgres database, both
described in [`render.yaml`](../render.yaml). Every push to `main` on GitHub deploys automatically, so
changes go live a few minutes after they're pushed — nothing to run by hand.

Photos are stored in the database (table `photo_blobs`), so there is no separate storage service;
they're resized in the browser before upload (2400 px, high-quality JPEG — usually 0.3–1 MB).
The app also builds as a container ([`Dockerfile`](../Dockerfile)) if you ever want another host.

## One-time move from Replit (about 30–45 minutes)

You need: a Render account, the AstroPilot Repl on Replit, access to the DNS settings of
astropilot.space (where the domain is registered) and, for donations, your Stripe dashboard.

### 1. Create the app on Render

1. Sign in at [render.com](https://render.com) with the GitHub account **hkaldis**. The free **Hobby**
   workspace plan is enough (it includes the two custom domains astropilot.space needs).
2. **New → Blueprint**, pick the repository **hkaldis/astropilot**, and apply it. This creates
   - `astropilot` — the web app (0.5 CPU / 512 MB, always on), in Frankfurt;
   - `astropilot-db` — PostgreSQL 16 (0.1 CPU / 256 MB, 5 GB of storage that grows by itself when
     it's 90% full), in Frankfurt.

   Cost, per render.com/pricing in October 2026: about **$14.50 a month** — $7 for the app, $6 for the
   database and $1.50 for its 5 GB of storage ($0.30 per GB). Traffic up to 5 GB a month is included
   (then $0.15 per GB); app files are compressed and cached, so a first visit downloads well under 1 MB.
3. Render asks for the secrets. Copy them from **Replit → Secrets**:
   - `SESSION_SECRET` — use the *same* value as on Replit, so nobody is signed out;
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — the same values as on Replit;
   - `STRIPE_SECRET_KEY` — optional, for donations: Stripe Dashboard → Developers → API keys → Secret
     key. Leave it empty and the Support page simply hides donations.
4. The first deploy starts. The app comes up with an empty database — that's expected.

### 2. Copy your data (users, logins, locations, gear, journal, photos)

1. Render → **astropilot-db** → **Connect** → copy the **External Database URL**.
2. Replit → the AstroPilot Repl → **Shell**, and run (paste the URL between the quotes):

   ```bash
   NEW_DATABASE_URL='paste-the-external-url-here' bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/move-off-replit.sh)
   ```

   It copies the photos from Replit storage into the database, copies the whole database to Render,
   and prints the row counts on both sides. It never changes anything on Replit.
3. Render → **astropilot** → **Manual Deploy → Restart service**, so the app picks up the copied data.

### 3. Try it on the Render address

Open the address shown at the top of the `astropilot` service (e.g. `https://astropilot.onrender.com`)
and sign in with your email and password. Google sign-in works there only if you add
`https://astropilot.onrender.com/api/auth/google/callback` to the OAuth client's *Authorized redirect
URIs* (Google Cloud Console → APIs & Services → Credentials) — optional, astropilot.space needs no change.

### 4. Switch astropilot.space

1. Right before switching, run the command from step 2 again, so anything logged in the meantime
   comes across too (it replaces the copy on Render), then restart the service again.
2. Render → **astropilot → Settings → Custom Domains**: add `astropilot.space` and `www.astropilot.space`.
   Render shows the DNS records to use.
3. Replit → **Deployments → Settings**: remove the custom domain.
4. At your domain registrar, replace the Replit DNS records with Render's. The switch takes from a few
   minutes to a few hours; Render issues the HTTPS certificate itself.
   (If the domain was bought through Replit, transfer it to a registrar first.)

### 5. Check, then switch Replit off

On https://astropilot.space: sign in with Google, open your journal, a photo and the Achievements page.
When everything looks right, stop the Replit deployment (Replit → Deployments → shut down). Keep the
Repl for a few weeks as a fallback, then delete it.

## After the move

- **Deploys:** push to `main` → Render builds and deploys (watch it under the service's *Events*).
  The database is upgraded automatically and additively on start (`server/migrate.ts`).
- **Backups:** Render backs up the database continuously: *astropilot-db → Recovery → Point-in-Time
  Recovery* restores it to any moment of the past 3 days (7 days on the Pro workspace plan). For a copy
  to keep, use *Create export* on the same page and download it (exports are kept for 7 days).
- **Logs:** the service's *Logs* tab.
- **Environment:** `DATABASE_URL`, `SESSION_SECRET` (required); `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  (Google sign-in); `STRIPE_SECRET_KEY` (donations); `APP_URL` (public address, for Stripe return links);
  `PHOTO_STORAGE` (`db`, default; `replit` only on Replit).
