# EFESMS Cloud Deployment Checklist (Render + Neon)

This deploys your Extreme Fire Services app to the cloud for **$0/month**.
The app will be accessible throughout Zimbabwe (and anywhere) via a web URL.

**Time needed:** ~30-45 minutes. **Cost:** $0. **No command line needed.**

---

## What you'll end up with
- A web URL (e.g., `https://efesms-api.onrender.com`) for the backend
- A web URL (e.g., `https://efesms-web.onrender.com`) for the frontend
- A cloud Postgres database (Neon)
- Login: `info@extremefire.co.zw` / `EXTREME.123` (change this after first login!)

---

## STEP 0 — Create accounts (free)
1. Go to https://github.com → **Sign up** (free). Verify your email.
2. Go to https://neon.tech → **Sign up** (free). Use "GitHub" to sign up if you want.
3. Go to https://render.com → **Sign up** (free). Use "GitHub" to sign up (easiest).

---

## STEP 1 — Put the code on GitHub
1. In your GitHub account, click **"+" → "New repository"**.
2. Name it `efesms`. Leave it **Public** (free). Click **Create repository**.
3. On your computer, open a terminal in the project folder and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/efesms.git
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username.)

> If you get stuck on this step, tell me and I'll run these commands for you.

---

## STEP 2 — Create the database (Neon)
1. In Neon, click **"New Project"**.
2. Name it `efesms`. Region: pick the closest (e.g., **Frankfurt** or **AWS us-east-1**).
3. Click **Create Project**.
4. On the project dashboard, copy the **Connection String** (it looks like:
   `postgresql://user:pass@host/efesms?sslmode=require`).
5. **Save this string somewhere safe** — you'll paste it into Render next.

---

## STEP 3 — Deploy the backend (Render)
1. In Render, click **"New" → "Web Service"**.
2. Connect your `efesms` GitHub repo (click **"Connect"** next to it).
3. Fill in:
   - **Name:** `efesms-api`
   - **Runtime:** should auto-detect **Docker** (it reads the `Dockerfile`)
   - **Plan:** **Free**
4. Click **"Create Web Service"** — it will start building (takes ~5-10 min).
5. While it builds, go to the **"Environment"** tab and add these variables:

   | Key | Value |
   |---|---|
   | `ConnectionStrings__Default` | *(paste your Neon connection string from Step 2)* |
   | `Jwt__Key` | *(generate a random 40+ char string, e.g. from https://randomkeygen.com)* |
   | `Jwt__Issuer` | `EFESMS` |
   | `Jwt__Audience` | `EFESMS.Clients` |
   | `BootstrapAdmin__Username` | `admin@extremefire.co.zw` |
   | `BootstrapAdmin__Password` | *(choose a strong password — this is the first admin login)* |
   | `BootstrapAdmin__Email` | `admin@extremefire.co.zw` |
   | `BootstrapAdmin__DisplayName` | `Extreme Fire Services` |

6. After adding env vars, the service will redeploy. Wait for **"Live"** status.
7. Copy your backend URL: `https://efesms-api.onrender.com` (shown at the top).

---

## STEP 4 — Deploy the frontend (Render)
1. In Render, click **"New" → "Static Site"**.
2. Connect your `efesms` GitHub repo again.
3. Fill in:
   - **Name:** `efesms-web`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Expand **"Advanced"** and add one environment variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://efesms-api.onrender.com/api/v1`  *(your backend URL from Step 3)*
5. Click **"Create Static Site"** — it will build and deploy (~3-5 min).
6. When done, you'll get a URL like `https://efesms-web.onrender.com`.

---

## STEP 5 — Test it
1. Open the frontend URL on your **phone** (mobile data) and on your **computer**.
2. Log in with the admin credentials you set in Step 3.
3. Create a job card, add task lines, save — verify it works.
4. Check the data appears in Neon (table view) and in the app.

---

## STEP 6 — (Optional) Custom domain
If you want a domain like `efesms.co.zw`:
1. Buy a domain (~ZWL/yr from a local registrar or ~$10/yr from Namecheap/GoDaddy).
2. In Render, go to your site → **"Custom Domains"** → follow the DNS instructions.

---

## Troubleshooting
- **Backend won't start:** Check the **"Logs"** tab in Render. Make sure `ConnectionStrings__Default` is pasted correctly (no extra spaces).
- **Frontend can't reach backend:** Make sure `VITE_API_URL` in Step 4 matches your backend URL exactly (including `https://` and `/api/v1`).
- **"Live" but page won't load:** Wait 1-2 min — free tier cold-starts take ~30-50s on first load.
- **Login fails:** The bootstrap admin is created on first boot. If it fails, check the backend logs for a DB connection error.

---

## Important security notes
- **Change the admin password** after first login (the bootstrap one is temporary).
- **Keep your Neon connection string and JWT key secret** — don't share them.
- The app is protected by login, so only people with credentials can use it.
