# Data Model — MVP (Sync First)

The whole product is 6 tables. The "smart shopping list" is a query, not a pipeline.

## Core idea

A **household** is the unit of sharing (you + husband = one household). Everything
— recipes, the week's plan, the shopping list — belongs to a household, so both
members see the same data. This same `household` concept is what later lets *mom's
household* share a recipe *into* your household (Phase 2). We design for it now,
use it minimally.

## Tables

### `households`
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| name | text | "The Yi Kitchen" |
| created_at | timestamptz | |

### `members`  (links a Supabase auth user to a household)
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| household_id | uuid (fk → households) | |
| user_id | uuid (fk → auth.users) | |
| display_name | text | "Ina", "husband" |
| role | text | 'owner' \| 'member' (for later) |

> A user could belong to more than one household later (your kitchen + helping
> mom's). MVP: one each.

### `recipes`
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| household_id | uuid (fk) | owner household |
| title | text | "Coconut Miso Salmon Curry" |
| source_url | text (nullable) | e.g. NYT link — link only, no scraped content |
| notes | text (nullable) | our own notes / steps |
| image_url | text (nullable) | our own photo (Phase 2) |
| created_by | uuid (fk → members) | |
| created_at | timestamptz | |

### `recipe_ingredients`
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| recipe_id | uuid (fk → recipes) | |
| name | text | normalized-ish: "onion", "soy sauce" |
| quantity | numeric (nullable) | 2 |
| unit | text (nullable) | "onions", "tbsp", null |
| category | text (nullable) | 'produce','meat','dairy','pantry','frozen','other' |

### `meal_plan_entries`  (one dinner slot on one date)
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| household_id | uuid (fk) | |
| date | date | the day this meal is for |
| recipe_id | uuid (fk → recipes, nullable) | null if free-text |
| freetext | text (nullable) | "Dumplings" when not a saved recipe |
| added_by | uuid (fk → members) | |
| created_at | timestamptz | |

> Week view = `select * from meal_plan_entries where household_id = ? and date
> between monday and sunday`. No separate "week" table needed.

### `shopping_list_items`
| column | type | notes |
|---|---|---|
| id | uuid (pk) | |
| household_id | uuid (fk) | |
| name | text | |
| quantity | numeric (nullable) | merged total |
| unit | text (nullable) | |
| category | text (nullable) | for aisle grouping |
| source | text | 'recipe' \| 'manual' |
| is_bought | boolean | default false |
| bought_by | uuid (fk → members, nullable) | who checked it off |
| bought_at | timestamptz (nullable) | |

---

## The "smart" auto-dedupe (it's just SQL)

Regenerating the list from this week's planned recipes:

```sql
-- ingredients from all recipes planned this week, merged by name+unit
select
  ri.name,
  ri.unit,
  sum(coalesce(ri.quantity, 1)) as quantity,
  max(ri.category) as category
from meal_plan_entries mpe
join recipe_ingredients ri on ri.recipe_id = mpe.recipe_id
where mpe.household_id = :hh
  and mpe.date between :monday and :sunday
group by ri.name, ri.unit;
```

That `group by name, unit` **is** the entire "avoid duplicates" feature. No Spark.
Manual items (paper towels) are just rows with `source='manual'` that we don't
overwrite on regenerate.

MVP dedupe rule: match on **lowercased name + unit**. Punt unit conversion.

---

## Realtime sync (story #5) — how "bought for both" works

Supabase Realtime broadcasts row changes on `shopping_list_items`. Both phones
subscribe to `household_id = ours`. When one person sets `is_bought = true`, the
other's screen updates within a second. This is the feature that kills
double-buying — and it's a built-in Supabase capability, not something we build.

---

## Row-Level Security (do this from day 1)

Every table: a user can only read/write rows whose `household_id` matches a
household they're a `member` of. One policy pattern, applied everywhere. This is
what makes "shared with my spouse, invisible to everyone else" true and safe —
and it's the same mechanism that will safely gate cross-household recipe sharing
later.

---

## Phase 2 hooks already baked in

- **Cross-household recipe sharing** (mom's noodles): add a `recipe_shares`
  table (recipe_id, shared_with_household_id). The `household` model already
  supports it.
- **Video/voice steps:** add `recipe_steps` (recipe_id, order, text, media_url).
- Nothing above needs to change to get there.
