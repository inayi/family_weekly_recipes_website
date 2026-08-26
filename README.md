# What's for Dinner? 🍽️

A private, shared kitchen for two people who plan meals and shop separately
and are tired of double-buying groceries or texting "what's for dinner?"
every day. No email, no password — just a name and a 6-digit PIN.

**Live app:** see your Vercel deployment (e.g. `ourkitchen-sync.vercel.app`)

---

## What it does (MVP)

- **Shared weekly meal plan** — either person adds a dinner to any day;
  the other sees it appear automatically.
- **Auto-deduped shopping list** — pulls ingredients from the week's planned
  recipes and merges duplicates into one line per item.
- **Live sync while shopping** — checking an item off updates both phones
  within a second or two, so you never both buy the same thing.
- **A small family recipe box** — save a recipe's title, a link to its
  source (we never copy others' text/photos), and your own ingredient list.

See [MVP-SPEC.md](MVP-SPEC.md) for the full product spec and what's
deliberately *out* of scope for now, and [DESIGN.md](DESIGN.md) for why the
product and its architecture look the way they do.

---

## Architecture overview

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Browser (app/*.html)   │        │           Supabase           │
│                         │        │                                │
│  index.html / help.html│  HTTPS │  Postgres  (6 tables)          │
│  app.js  (vanilla JS)   │◄──────►│  Row Level Security policies  │
│  style.css              │        │  Anonymous Auth  (no email)   │
│  supabase-js client      │        │  Realtime  (row-change events) │
└─────────────────────────┘        └──────────────────────────────┘
        ▲
        │  static files, no build step
        │
┌─────────────────────────┐
│         Vercel          │
│  serves app/ as root     │
└─────────────────────────┘
```

**Frontend** — plain HTML/CSS/JS, no framework and no build step. `app.js`
talks directly to Supabase from the browser using the `supabase-js` SDK and
the public "anon" key (see *Security model* below for why that's safe to
expose). Three files: [`app/index.html`](app/index.html) (the app),
[`app/help.html`](app/help.html) (user-facing manual), styled by
[`app/style.css`](app/style.css).

**Backend** — [Supabase](https://supabase.com) provides Postgres, auth, and
realtime as a hosted free-tier service; there is no custom server. The full
schema — tables, Row Level Security policies, and grants — lives in
[`supabase/schema.sql`](supabase/schema.sql) and is described in
[DATA-MODEL.md](DATA-MODEL.md).

**Auth** — Supabase's *anonymous* sign-in gives every device a real
`auth.uid()` without ever asking for an email or password. A `households` +
`members` table pair then links that anonymous identity to a shared "kitchen"
via a 6-digit PIN. This is what makes the login screen feel like nothing at
all, while Row Level Security still has a real identity to check.

**Sync** — the "don't double-buy groceries" feature is Supabase Realtime:
both browsers subscribe to `shopping_list_items` and `meal_plan_entries` for
their household, and Postgres pushes row changes to both immediately.

**Deployment** — Vercel serves the `app/` folder as static files. No server
process, no port exposed on anyone's machine. Every `git push` to `main`
auto-redeploys.

---

## Security model, briefly

- Every table has Row Level Security: a request can only read/write rows
  whose `household_id` belongs to a household the requester is a `member`
  of. See the policies in `supabase/schema.sql`.
- The Supabase **anon key** committed in `app/config.js` is meant to be
  public — it identifies the *project*, not a user, and every request made
  with it is still filtered by RLS. This is the standard way Supabase apps
  ship to production.
- The Supabase **service role key** (which *does* bypass RLS) is never used
  anywhere in this app and must never be added to it.
- `issue_reports` (the in-app "report a problem" form) is insert-only from
  the app — nobody can read other people's reports through the app itself,
  only via the Supabase dashboard.

---

## Repo layout

```
app/                    the live app — everything above describes this
  index.html            main app (week plan, shopping list, recipes)
  help.html             in-app user manual + "report a problem" form
  app.js / style.css     logic and styling
  config.js               Supabase URL + anon key (safe to commit — see above)
  config.example.js       template for config.js
supabase/
  schema.sql             tables, RLS policies, grants — the entire backend
MVP-SPEC.md              product spec: user stories, what's in/out of scope
DATA-MODEL.md            the 6-table schema, explained
DESIGN.md                design rationale: problem, decisions, tradeoffs
SETUP.md                 how to run this locally and deploy it
```

### Superseded / archived

- `index.html`, `public/`, `assets/` (repo root) — the original static
  recipe page this project grew out of. Kept for history; the live product
  is entirely in `app/` now.
- `meal-planner-project-plan.md` — an earlier 28-week plan built around a
  full data-engineering stack (PySpark/Kafka/Airflow). Superseded by
  `MVP-SPEC.md`, which scopes to what two people actually need first.

---

## Running it yourself

See [SETUP.md](SETUP.md) for the full walkthrough — creating a free
Supabase project, running the schema, and deploying to Vercel.

---

## Roadmap (not built yet)

- Cross-household recipe sharing (e.g. a parent's recipe shared into your
  kitchen) — the `household` model is already designed to support this.
- Recipe steps with photos/video.
- Passive ingredient-freshness nudges.

See [DESIGN.md](DESIGN.md) for why these are deliberately deferred.
