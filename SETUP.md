# Setup — run the app in ~15 minutes

The app is done. It just needs a free Supabase project (the database + sync
engine) that only *you* can create, since it needs your account.

## 1. Create a free Supabase project  (~3 min)  — you do this
1. Go to https://supabase.com and sign up (free tier is plenty).
2. Click **New project**. Give it a name (e.g. `whats-for-dinner`), pick a
   region near you, set a database password (save it somewhere).
3. Wait ~2 min for it to provision.

## 2. Create the database  (~1 min)
1. In your project, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql), copy the whole file,
   paste it in, click **Run**. You should see "Success".

## 3. Turn on anonymous sign-in  (~30 sec)
No email, no password for you two — but the app still needs a real per-device
identity behind the scenes so your data stays private. Supabase's "anonymous"
auth gives us that invisibly.
- Supabase → **Authentication** → **Providers** → find **Anonymous Sign-Ins**
  → toggle it **on** → Save.

## 4. Wire up your keys  (~2 min)
1. Supabase → **Project Settings** → **API**. Copy:
   - **Project URL**
   - **anon public** key  (this is safe in the browser — Row Level Security
     protects your data)
2. Copy [`app/config.example.js`](app/config.example.js) to `app/config.js`.
3. Paste your URL and anon key into `app/config.js`.
   (This file **is** committed to git — that's fine. The anon key is
   specifically designed to be public; your data is protected by the Row
   Level Security rules in `schema.sql`, not by hiding this key. Don't ever
   put a Supabase *service role* key anywhere in this app, though — that one
   really is a secret.)

## 5. Run it locally  (~1 min)
From the project root:

```bash
python -m http.server 8000
```

Then open **http://localhost:8000/app/** on your computer.
(You can't just double-click the HTML — Supabase auth needs a real http URL.)

## 6. Try it with your husband
1. You: open the app, type your name, click **Create** a new kitchen.
2. Click **Invite** (top right) to see the 6-digit PIN, and tell him.
3. Him: open the same URL, type his name, choose **Join your partner's**,
   enter the PIN.
4. Add dinners to the week, add a recipe or two with ingredients, hit
   **Regenerate shopping list**, and watch items check off live on both phones.

No accounts, no email, no password — just a name and a PIN, once per device.

## 7. Deploy it for real (~10 min) — so it's not running on your laptop

**Don't host this from your own machine long-term.** It would mean leaving
your computer on and connected 24/7, opening a port on your home router (a
real security exposure to your whole network, not just this app), and the
URL breaking whenever your home IP changes. Instead, deploy to **Vercel**
(free) — it just serves static files; nothing runs on your computer, and no
port on your network is ever opened.

1. **Push this repo to GitHub** (if it isn't already):
   ```bash
   git add -A
   git commit -m "What's for Dinner? MVP"
   git push
   ```
   (Ask me to do this with you if you want a hand — pushing is something I'll
   confirm with you first either way.)
2. Go to https://vercel.com → sign up/sign in with your GitHub account →
   **Add New Project** → import this repo.
3. In the import screen, set **Root Directory** to `app`.
4. Framework preset: **Other** (it's plain HTML/CSS/JS — no build step needed).
5. Click **Deploy**. In ~30 seconds you'll get a URL like
   `whats-for-dinner.vercel.app`.
6. Open that URL, create your kitchen, invite your husband with the PIN —
   same as step 6, but now it's a real link you can both bookmark on your
   phones, and it stays up even if your laptop is off.

Every time you `git push` afterward, Vercel automatically redeploys.

---

### If something breaks
- **Blank page / "Missing config"** → you haven't created `app/config.js` yet.
- **Stuck on the name/PIN screen, nothing happens when you click Create/Join**
  → anonymous sign-in is probably still off — check step 3.
- **"No kitchen found with that PIN"** → PINs are 6 digits; double-check.
- Tell me the error and I'll fix it.
