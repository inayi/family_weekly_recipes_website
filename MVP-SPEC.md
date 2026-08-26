# MVP Spec — "What's for Dinner?" (Sync First)

> **One line:** A shared meal plan + auto-deduped grocery list for a couple who
> shop separately and are tired of coordinating dinner like a project.

**Status:** MVP definition · **Users at launch:** 2 (me + husband) ·
**Goal:** stop double-buying and daily "what's for dinner?" texts — without a family meeting.

---

## The one problem we're solving (and nothing else, yet)

We both shop on our own time during the week. We don't sync. Result:
- We buy the same things twice.
- We text each other daily to figure out what's for dinner.

**MVP success = for 3 weeks straight, we plan and shop from the app and stop
texting about groceries.** That's it. If that happens, we have something real.

Explicitly **NOT** in the MVP (parked, not forgotten):
- Family recipe sharing across households (mom's noodles) — *Phase 2, the growth loop*
- Video / voice recipe steps — *Phase 2+*
- Receipt scanning & freshness tracking — *maybe never; deliver passively later*
- Smart fridge — *not a real thing for us*
- Any big-data pipeline (PySpark/Kafka/Airflow) — *not a product need*

---

## Core user stories (MVP)

1. **Shared week view.** We open the app and see the same 7-day dinner plan.
   Either of us can add/change a meal. Changes show up for both.
2. **Add a meal fast.** Type a name ("Dumplings") *or* pick from Our Recipes.
   Optionally paste a source link (e.g. an NYT URL) — we store the link, not their content.
3. **A recipe has ingredients.** When we add a saved recipe to a day, its
   ingredients flow into the shopping list.
4. **One auto-deduped shopping list.** All ingredients from the week's meals,
   merged so "2 onions" + "1 onion" = "3 onions." Grouped by aisle/category.
5. **Claim while shopping.** Whoever's at the store taps "shopping now."
   Checking off an item marks it bought *for both of us, in real time*, so the
   other person doesn't re-buy it.
6. **Manual add to list.** Add "paper towels" directly to the list without a recipe.

That's the whole MVP. Six stories.

---

## The one design principle

**No meeting required.** Every feature must work asynchronously, on our own
schedules. If a feature needs us to sit down together, it's wrong for this app.

---

## Recipe content & copyright (decided)

- We **never scrape or copy** NYT Cooking (or similar) content. It violates their
  ToS and their protected creative text/photos.
- For MVP we support: **manual entry** (type your own ingredients + steps) and
  **saving a source link** (title + URL only).
- Ingredient lists and functional steps are facts (not copyrightable); creative
  headnotes/photos are theirs. We store our own words and link out for the rest.
- Our moat is *our family's* recipes, not anyone's paywalled content.

---

## Tech stack (right-sized, ~free)

- **Frontend:** React + Vite + Tailwind (or plain — see note below)
- **Backend + DB + Auth + Realtime:** **Supabase** (Postgres). Its realtime
  subscriptions give us story #5 — "bought" syncs live — for free.
- **Hosting:** Vercel (free)
- **No** Kafka/Spark/Airflow/Glue. The whole "auto-dedupe" is one SQL query.

> Note: we could even ship a v0 as a single static page + Supabase with no build
> step, to validate faster. Decision pending — see open questions.

---

## Open questions for us

1. **Auth simplicity:** magic-link email (no passwords) — agree?
2. **Units/dedupe depth:** for MVP, dedupe by ingredient *name* + simple quantity
   sum; punt on unit conversion (tsp→tbsp). Good enough?
3. **Ship v0 as static + Supabase, or go straight to React?**
4. **Aisle categories:** hardcode a sensible list (Produce, Meat, Dairy, Pantry,
   Frozen, Other) or skip grouping for v0?

---

## What "done" looks like for MVP

- [ ] Both of us logged in, seeing one shared week.
- [ ] Add meals (typed or from saved recipes) to any day.
- [ ] Saved recipes carry ingredients into the list.
- [ ] Shopping list auto-merges duplicate ingredients.
- [ ] Checking "bought" updates live for both of us.
- [ ] Deployed at a URL we can both open on our phones.
