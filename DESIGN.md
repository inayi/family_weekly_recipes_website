# Design Doc — What's for Dinner?

This doc captures *why* the product and system look the way they do —
the problem, the decisions, and the tradeoffs. For *what* it does, see
[MVP-SPEC.md](MVP-SPEC.md). For the schema, see [DATA-MODEL.md](DATA-MODEL.md).

## Problem

Two working professionals shop for groceries separately, on their own
schedules, with no time to sync. Result: duplicate purchases, and a daily
"what's for dinner?" negotiation. Neither person wants a fix that feels like
another meeting or another chore — the fix has to be *invisible* coordination,
not a new task.

A second, related but distinct pain: family recipes (a parent's noodles, a
Sunday roast) live only in people's heads or across long distances, with no
easy way to keep them. That pain is real but is explicitly **not** part of
the MVP — see *Scope decisions* below.

## Goals

1. Stop double-buying groceries between two people who don't coordinate live.
2. Make "what's for dinner" visible without either person asking.
3. Do both without requiring a meeting, a shared calendar ritual, or any new
   daily habit beyond opening one app.

## Non-goals (for this phase)

- Recipe *discovery* or recommendation.
- Nutrition tracking, budgeting, pantry inventory.
- Receipt scanning / freshness prediction — see *Rejected ideas* below.
- Video/voice recipe steps, cross-household sharing — deferred, not rejected;
  the data model anticipates them (see DATA-MODEL.md's "Phase 2 hooks").
- Supporting more than a small household (a couple, maybe a roommate/parent).
  Nothing stops more members joining a household, but nothing is designed
  for e.g. 10+ people either.

## Key decisions and why

### 1. Ship the sync problem first, not the emotional/sharing problem
Two genuinely different products were on the table: a *productivity* tool
(sync meal plans + shopping) and an *emotional/social* tool (preserve and
share family recipes, with video). They attract different users and need
different features. Building both at once risks building neither well.
**Decision:** ship sync first, because it's the one with daily habit-forming
potential and it's simpler to build and validate with exactly two real users.
The recipe-box feature is deliberately minimal (title + link + ingredients,
no video) so it doesn't block the MVP, while the data model doesn't foreclose
the richer version later.

### 2. No email, no password — anonymous auth + household PIN
Originally scoped as magic-link email auth. In practice this was too much
friction for two people who just want to open the app. **Decision:** use
Supabase's anonymous sign-in to get a real per-device identity (needed so
Row Level Security has something to check) without ever surfacing an email
step. The visible flow is just "name + PIN," modeled on how a shared
Wi-Fi password already works for a household.

**Tradeoff accepted:** anyone who obtains the PIN can join the household —
there's no per-person verification. Judged acceptable because (a) the
threat model is "keep out strangers," not "cryptographically verify my
spouse," and (b) it mirrors PIN threat models to a WiFi network, which is
also treated as acceptable in most homes.

**Consequence:** no server-side "forgot my PIN" recovery is offered by
design — a low-friction recovery path (e.g. "recover by household name")
would equally lower the bar for a stranger to guess their way in. Recovery
today is: check another already-signed-in device, or look at the
`households` table directly in the Supabase dashboard.

### 3. The "smart" shopping list is one SQL query, not a data pipeline
An earlier plan (`meal-planner-project-plan.md`) scoped ingredient
aggregation as a PySpark + Kafka + Airflow pipeline. At the actual scale of
this product (two people, a few dozen ingredients a week), deduping is a
`GROUP BY name, unit` — genuinely one query. **Decision:** no big-data tooling
anywhere in this app. That plan is preserved in the repo as a historical
artifact, not a roadmap.

### 4. No framework, no build step
The whole frontend is vanilla HTML/CSS/JS talking directly to Supabase.
**Why:** the app is small enough that React/build tooling would add
ceremony (bundler config, deploy pipeline) without adding capability. If the
product grows past what a few hundred lines of vanilla JS can hold clearly,
revisit — not before.

### 5. Committing the Supabase anon key
The anon key in `app/config.js` is committed to git on purpose. It's
designed by Supabase to be public in client-side apps; the actual access
control is Row Level Security, not secrecy of this key. See the README's
*Security model* section. The service role key (which *would* be dangerous)
is never introduced.

### 6. Never scrape recipe sites
NYT Cooking and similar sites' recipe text/photos are copyrighted creative
expression, and scraping violates their Terms of Service regardless of
copyright specifics. Ingredient lists and basic steps are functional facts
and not copyrightable, but the app still only stores a **link** plus the
user's own written notes/ingredients — never copied text or images. This
was a deliberate legal/product boundary, not just a technical shortcut, and
it doubles as the actual moat: a scraped copy of NYT's content is worth
nothing distinctive, but a family's own recipes are.

## Rejected ideas (and why)

- **Receipt scanning + freshness prediction** ("strawberries bought Sunday
  will rot by Wednesday"). Rejected for MVP: OCR on real receipts is messy,
  mapping line items to ingredients is a hard data problem, and freshness-by-
  purchase-date is a guess that erodes trust the first time it's wrong. If
  revisited, prefer a *passive* version — inferred from the meal plan itself
  ("you planned salmon for Thursday") — over requiring users to photograph
  receipts.
- **Smart fridge integration.** Rejected outright: tiny install base,
  hardware makers want to own this layer themselves, and it doesn't serve
  either the sync pain or the recipe pain directly.
- **Build to be acquired** (e.g. by a grocery chain) as a stated goal.
  Rejected as a *strategy*: acquisitions follow real traction, they aren't
  planned for directly, and a grocer's incentive (sell more groceries) is
  in tension with this product's actual value (buy less, waste less).

## Open items / revisit later

- Unit conversion in shopping-list dedupe (currently: match on name+unit
  only, no tsp→tbsp conversion).
- Whether a "kitchen" should ever support more than ~3-4 members before
  needing role/permission concepts.
- If cross-household recipe sharing (Phase 2) ships, the PIN-based join
  model needs a second look — sharing a *recipe* into another household
  should not require joining it.
