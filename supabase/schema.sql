-- ============================================================
-- "What's for Dinner?" — MVP schema (sync first)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: it drops and recreates policies.
-- ============================================================

-- ---------- Tables ----------

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'member',
  created_at   timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null,
  source_url   text,
  notes        text,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  name       text not null,
  quantity   numeric,
  unit       text,
  category   text
);

create table if not exists meal_plan_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date         date not null,
  recipe_id    uuid references recipes(id) on delete set null,
  freetext     text,
  added_by     uuid references members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists shopping_list_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  quantity     numeric,
  unit         text,
  category     text,
  source       text not null default 'manual',   -- 'recipe' | 'manual'
  is_bought    boolean not null default false,
  bought_by    uuid references members(id) on delete set null,
  bought_at    timestamptz
);

create table if not exists issue_reports (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete set null,
  reporter     text,           -- display name, optional
  message      text not null,
  page         text,           -- which screen they were on
  created_at   timestamptz not null default now()
);

-- ---------- Helper: which households does the current user belong to? ----------

create or replace function my_household_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select household_id from members where user_id = auth.uid();
$$;

-- ---------- Row Level Security ----------
-- Rule everywhere: you can touch a row only if it belongs to a household you're a member of.

alter table households          enable row level security;
alter table members             enable row level security;
alter table recipes             enable row level security;
alter table recipe_ingredients  enable row level security;
alter table meal_plan_entries   enable row level security;
alter table shopping_list_items enable row level security;

-- households: members can read theirs; anyone signed-in can create one (to bootstrap);
-- reading by invite_code is needed so a new user can look up a household to join.
drop policy if exists hh_select on households;
create policy hh_select on households for select
  using ( id in (select my_household_ids()) or auth.uid() is not null );
drop policy if exists hh_insert on households;
create policy hh_insert on households for insert
  with check ( auth.uid() is not null );

-- members: you can see members of your households; you can insert yourself.
drop policy if exists mem_select on members;
create policy mem_select on members for select
  using ( household_id in (select my_household_ids()) );
drop policy if exists mem_insert on members;
create policy mem_insert on members for insert
  with check ( user_id = auth.uid() );

-- Generic household-scoped policies for the content tables.
drop policy if exists rec_all on recipes;
create policy rec_all on recipes for all
  using ( household_id in (select my_household_ids()) )
  with check ( household_id in (select my_household_ids()) );

drop policy if exists ring_all on recipe_ingredients;
create policy ring_all on recipe_ingredients for all
  using ( recipe_id in (select id from recipes where household_id in (select my_household_ids())) )
  with check ( recipe_id in (select id from recipes where household_id in (select my_household_ids())) );

drop policy if exists mpe_all on meal_plan_entries;
create policy mpe_all on meal_plan_entries for all
  using ( household_id in (select my_household_ids()) )
  with check ( household_id in (select my_household_ids()) );

drop policy if exists sli_all on shopping_list_items;
create policy sli_all on shopping_list_items for all
  using ( household_id in (select my_household_ids()) )
  with check ( household_id in (select my_household_ids()) );

-- issue_reports: anyone signed-in (even anonymously) can submit one; nobody
-- can read them back through the app — only via the Supabase dashboard
-- (which uses the service role and bypasses RLS). That's what keeps this
-- "stronger than mailto": the report never touches a visible email address,
-- and no other user of the app can read anyone else's reports.
alter table issue_reports enable row level security;
drop policy if exists issue_insert on issue_reports;
create policy issue_insert on issue_reports for insert
  with check ( auth.uid() is not null );

-- ---------- Grants ----------
-- RLS policies only restrict rows; the roles still need base table privileges
-- to be allowed to touch the table at all.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  households, members, recipes, recipe_ingredients, meal_plan_entries, shopping_list_items
  to authenticated;
grant select, insert on households to anon;  -- needed only during sign-up redirect edge cases
grant insert on issue_reports to authenticated;

-- ---------- Realtime ----------
-- Broadcast row changes so both phones update live (the anti-double-buying feature).
alter publication supabase_realtime add table shopping_list_items;
alter publication supabase_realtime add table meal_plan_entries;
