/* =========================================================================
   What's for Dinner? — MVP app logic (vanilla JS + Supabase)
   Views: loading -> auth -> onboard -> main
   ========================================================================= */

// ---------- Setup ----------
if (!window.APP_CONFIG || window.APP_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  document.getElementById("view-loading").innerHTML =
    '<div class="card narrow"><h1>Almost there</h1><p class="muted">Copy <code>config.example.js</code> to <code>config.js</code> and fill in your Supabase URL and anon key. See SETUP.md.</p></div>';
  throw new Error("Missing config.js");
}
const sb = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);

// App state
const state = {
  user: null,
  member: null,       // { id, household_id, display_name }
  household: null,    // { id, name, invite_code }
  weekStart: startOfWeek(new Date()),
  recipes: [],        // cached for the recipe picker
  channel: null,
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORIES = ["produce", "meat", "dairy", "pantry", "frozen", "other"];
const CAT_LABEL = { produce: "Produce", meat: "Meat & Seafood", dairy: "Dairy & Eggs", pantry: "Pantry", frozen: "Frozen", other: "Other" };
const UNITS = ["g","kg","oz","lb","lbs","ml","l","tsp","tbsp","cup","cups","clove","cloves","can","cans","bunch","pack","packs","slice","slices","piece","pieces","stick","sticks"];

// ---------- View switching ----------
function show(view) {
  ["loading", "onboard", "main"].forEach((v) =>
    $("view-" + v).classList.toggle("hidden", v !== view)
  );
}

// ---------- Date helpers ----------
function startOfWeek(d) {                // Monday
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;      // Mon=0 .. Sun=6
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function fmtRange(a, b) {
  const o = { month: "short", day: "numeric" };
  return a.toLocaleDateString(undefined, o) + " – " + b.toLocaleDateString(undefined, o);
}

// =========================================================================
//  AUTH — no email, no password. We sign in anonymously behind the scenes
//  (so Row Level Security still has a real per-device identity to check),
//  and the only thing you ever type is your name + your kitchen's PIN.
// =========================================================================
async function ensureAnonSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const { data: signIn, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return signIn.session;
}

async function signOut() {
  localStorage.removeItem("wfd_remembered");
  await sb.auth.signOut();
  location.reload();
}
$("link-signout-2").addEventListener("click", (e) => { e.preventDefault(); signOut(); });

async function boot() {
  let session;
  try { session = await ensureAnonSession(); }
  catch { return show("onboard"); }
  state.user = session.user;

  const { data: mem } = await sb.from("members").select("*").eq("user_id", state.user.id).limit(1).maybeSingle();
  if (!mem) return show("onboard");

  state.member = mem;
  const { data: hh } = await sb.from("households").select("*").eq("id", mem.household_id).single();
  state.household = hh;
  enterApp();
}

// =========================================================================
//  ONBOARDING — create a kitchen (gets a 6-digit PIN) or join one with a PIN
// =========================================================================
function randPin() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

$("btn-create-household").addEventListener("click", async () => {
  const name = $("household-name").value.trim() || "Our Kitchen";
  const displayName = $("display-name").value.trim();
  if (!displayName) return ($("onboard-msg").textContent = "Please add your name first.");
  $("onboard-msg").textContent = "Creating…";

  let session;
  try { session = await ensureAnonSession(); }
  catch (e) { return ($("onboard-msg").textContent = "Couldn't sign in (" + e.message + "). Is anonymous sign-in enabled in Supabase?"); }
  state.user = session.user;

  const pin = randPin();
  const { data: hh, error: e1 } = await sb.from("households").insert({ name, invite_code: pin }).select().single();
  if (e1) return ($("onboard-msg").textContent = e1.message);
  const { error: e2 } = await sb.from("members").insert({
    household_id: hh.id, user_id: state.user.id, display_name: displayName, role: "owner",
  });
  if (e2) return ($("onboard-msg").textContent = e2.message);
  boot();
});

$("btn-join-household").addEventListener("click", async () => {
  const pin = $("invite-code").value.replace(/\D/g, ""); // strip spaces/dashes/anything non-digit
  const displayName = $("display-name").value.trim();
  if (!displayName) return ($("onboard-msg").textContent = "Please add your name first.");
  if (!/^\d{6}$/.test(pin)) return ($("onboard-msg").textContent = "Enter the 6-digit PIN from your partner (numbers only).");
  $("onboard-msg").textContent = "Joining…";

  let session;
  try { session = await ensureAnonSession(); }
  catch (e) { return ($("onboard-msg").textContent = "Couldn't sign in (" + e.message + "). Is anonymous sign-in enabled in Supabase?"); }
  state.user = session.user;

  const { data: hh, error } = await sb.from("households").select("*").eq("invite_code", pin).maybeSingle();
  if (error || !hh) return ($("onboard-msg").textContent = "No kitchen found with that PIN.");
  const { error: e2 } = await sb.from("members").insert({
    household_id: hh.id, user_id: state.user.id, display_name: displayName,
  });
  if (e2) return ($("onboard-msg").textContent = e2.message);
  boot();
});

// =========================================================================
//  MAIN APP
// =========================================================================
async function enterApp() {
  $("hh-name").textContent = state.household.name;
  $("who").textContent = " · " + state.member.display_name;
  $("who").className = "muted who";
  show("main");
  subscribeRealtime();
  await Promise.all([loadRecipes(), renderWeek(), renderShoppingList()]);
}

// Tabs
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["week", "list", "recipes"].forEach((name) =>
      $("tab-" + name).classList.toggle("hidden", name !== t.dataset.tab)
    );
  })
);

// ----- Week view -----
$("week-prev").addEventListener("click", () => { state.weekStart = addDays(state.weekStart, -7); renderWeek(); });
$("week-next").addEventListener("click", () => { state.weekStart = addDays(state.weekStart, 7); renderWeek(); });

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

async function renderWeek() {
  const start = state.weekStart, end = addDays(start, 6);
  $("week-label").textContent = fmtRange(start, end);

  const { data: entries } = await sb
    .from("meal_plan_entries")
    .select("*, recipe:recipes(id,title,source_url)")
    .eq("household_id", state.household.id)
    .gte("date", isoDate(start)).lte("date", isoDate(end));

  // group by date, then by meal type — a day can have several meals now
  const byDate = {};
  (entries || []).forEach((e) => {
    (byDate[e.date] ??= {})[e.meal_type || "dinner"] = e;
  });

  const todayIso = isoDate(new Date());
  const grid = $("week-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i), iso = isoDate(d);
    const dayEntries = byDate[iso] || {};
    const row = document.createElement("div");
    row.className = "day" + (iso === todayIso ? " today" : "");

    row.innerHTML = `<div class="daylabel">${DAYS[i]}<small>${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div>`;

    // Always show dinner (even empty, so it's the default one-tap add).
    // Only show breakfast/lunch/snack rows that already have something planned.
    const typesToShow = MEAL_TYPES.filter((t) => t === "dinner" || dayEntries[t]);

    typesToShow.forEach((type) => {
      const entry = dayEntries[type];
      const mealRow = document.createElement("div");
      mealRow.className = "meal-row";
      if (entry) {
        const title = entry.recipe ? entry.recipe.title : entry.freetext;
        const link = entry.recipe?.source_url
          ? `<a href="${entry.recipe.source_url}" target="_blank" rel="noopener">${esc(title)}</a>`
          : esc(title);
        mealRow.innerHTML =
          `<span class="meal-type">${MEAL_LABEL[type]}</span>` +
          `<div class="meal">${link}</div><button class="chip-x">✕</button>`;
        el(".chip-x", mealRow).addEventListener("click", async (ev) => {
          ev.stopPropagation();
          await sb.from("meal_plan_entries").delete().eq("id", entry.id);
          renderWeek();
        });
      } else {
        mealRow.innerHTML = `<span class="meal-type">${MEAL_LABEL[type]}</span><div class="meal add">+ add ${MEAL_LABEL[type].toLowerCase()}</div>`;
        el(".meal", mealRow).addEventListener("click", () => openMealModal(iso, DAYS[i], type));
      }
      row.appendChild(mealRow);
    });

    // "+ add another meal" — lets breakfast/lunch/snack get added when not already shown
    const missing = MEAL_TYPES.filter((t) => !typesToShow.includes(t));
    if (missing.length) {
      const addMore = document.createElement("button");
      addMore.className = "add-more-meal";
      addMore.textContent = "+ add another meal";
      addMore.addEventListener("click", () => openMealModal(iso, DAYS[i], missing[0]));
      row.appendChild(addMore);
    }

    grid.appendChild(row);
  }
}

// ----- Add meal modal -----
let mealModalDate = null;
function openMealModal(iso, dayLabel, defaultType) {
  mealModalDate = iso;
  $("meal-day-label").textContent = dayLabel;
  $("meal-freetext").value = "";
  $("meal-type-select").value = defaultType || "dinner";
  const sel = $("meal-recipe-select");
  sel.innerHTML = '<option value="">— choose —</option>' +
    state.recipes.map((r) => `<option value="${r.id}">${esc(r.title)}</option>`).join("");
  sel.value = "";
  openModal("modal-meal");
}
$("btn-save-meal").addEventListener("click", async () => {
  const recipeId = $("meal-recipe-select").value || null;
  const freetext = $("meal-freetext").value.trim() || null;
  const mealType = $("meal-type-select").value;
  if (!recipeId && !freetext) return;
  await sb.from("meal_plan_entries").insert({
    household_id: state.household.id, date: mealModalDate, meal_type: mealType,
    recipe_id: recipeId, freetext: recipeId ? null : freetext, added_by: state.member.id,
  });
  closeModal();
  renderWeek();
});

// ----- Recipes -----
async function loadRecipes() {
  const { data } = await sb.from("recipes").select("*, recipe_ingredients(*)")
    .eq("household_id", state.household.id).order("created_at", { ascending: false });
  state.recipes = data || [];
  renderRecipeList();
}
function renderRecipeList() {
  const box = $("recipe-list");
  box.innerHTML = state.recipes.length ? "" : '<p class="muted">No recipes yet. Add your favorites — mom\'s noodles can wait for Phase 2 😉</p>';
  state.recipes.forEach((r) => {
    const ings = (r.recipe_ingredients || []).map((i) => i.name).join(", ");
    const card = document.createElement("div");
    card.className = "recipe-card";
    card.innerHTML =
      `<h3>${r.source_url ? `<a href="${r.source_url}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</h3>` +
      `<div class="ings">${ings ? esc(ings) : "no ingredients yet"}</div>`;
    box.appendChild(card);
  });
}
$("btn-new-recipe").addEventListener("click", () => {
  $("recipe-title").value = ""; $("recipe-url").value = ""; $("recipe-ingredients").value = "";
  openModal("modal-recipe");
});
$("btn-save-recipe").addEventListener("click", async () => {
  const title = $("recipe-title").value.trim();
  if (!title) return;
  const url = $("recipe-url").value.trim() || null;
  const { data: rec, error } = await sb.from("recipes").insert({
    household_id: state.household.id, title, source_url: url, created_by: state.member.id,
  }).select().single();
  if (error) return alert(error.message);

  const ings = parseIngredients($("recipe-ingredients").value);
  if (ings.length) {
    await sb.from("recipe_ingredients").insert(ings.map((i) => ({ recipe_id: rec.id, ...i })));
  }
  closeModal();
  await loadRecipes();
});

// Parse "2 onion" / "1 tbsp soy sauce" / "salmon"
// Lines that are recipe metadata, not ingredients — e.g. pasted straight from
// a site's "Ingredients" block along with its yield/serving/time header.
const NON_INGREDIENT_LINE = /^(yield|serves?|servings?|makes|prep(aration)? time|cook(ing)? time|total time|notes?|ingredients?:?|directions?|instructions?|nutrition.*)\b/i;
const SERVINGS_RANGE = /^\d+\s*[-–to]+\s*\d+\s*(servings?|people|portions?)?$/i;

function parseIngredients(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean)
    .filter((line) => !NON_INGREDIENT_LINE.test(line) && !SERVINGS_RANGE.test(line))
    .map((line) => {
      const parts = line.split(/\s+/);
      let quantity = null, unit = null;
      if (parts.length && /^\d+(\.\d+)?$/.test(parts[0])) { quantity = parseFloat(parts.shift()); }
      if (quantity !== null && parts.length && UNITS.includes(parts[0].toLowerCase())) { unit = parts.shift().toLowerCase(); }
      const name = parts.join(" ").toLowerCase();
      return { name: name || line.toLowerCase(), quantity, unit, category: guessCategory(name) };
    });
}
function guessCategory(name) {
  const n = name.toLowerCase();
  const has = (arr) => arr.some((w) => n.includes(w));
  if (has(["chicken","beef","pork","salmon","fish","shrimp","turkey","bacon","sausage","lamb"])) return "meat";
  if (has(["milk","cheese","yogurt","butter","cream","egg"])) return "dairy";
  if (has(["onion","garlic","tomato","lettuce","arugula","spinach","pepper","carrot","potato","lemon","lime","apple","berry","broccoli","cucumber","herb","cilantro","parsley","ginger","scallion","mushroom"])) return "produce";
  if (has(["frozen","ice cream","peas"])) return "frozen";
  if (has(["flour","sugar","rice","pasta","oil","sauce","soy","vinegar","salt","spice","can","bean","stock","broth","noodle","bread"])) return "pantry";
  return "other";
}

// ----- Shopping list -----
async function renderShoppingList() {
  const { data: items } = await sb.from("shopping_list_items")
    .select("*").eq("household_id", state.household.id).order("name");
  const box = $("shopping-list");
  box.innerHTML = "";
  if (!items || !items.length) { box.innerHTML = '<p class="muted">List is empty. Add items, or regenerate from this week\'s meals.</p>'; return; }

  const memberNames = await getMemberNames();
  const grouped = {};
  items.forEach((it) => { (grouped[it.category || "other"] ??= []).push(it); });

  CATEGORIES.forEach((cat) => {
    if (!grouped[cat]) return;
    const head = document.createElement("div"); head.className = "cat-head"; head.textContent = CAT_LABEL[cat];
    box.appendChild(head);
    grouped[cat].forEach((it) => box.appendChild(renderItem(it, memberNames)));
  });
}
function renderItem(it, memberNames) {
  const qty = it.quantity ? `${trimNum(it.quantity)}${it.unit ? " " + it.unit : ""} ` : "";
  const row = document.createElement("div");
  row.className = "item" + (it.is_bought ? " bought" : "");
  row.innerHTML =
    `<input type="checkbox" ${it.is_bought ? "checked" : ""} />` +
    `<div class="txt">${qty}${esc(it.name)}` +
      `${it.is_bought && it.bought_by ? `<span class="by"> ✓ ${esc(memberNames[it.bought_by] || "")}</span>` : ""}` +
      `<span class="src"> · ${it.source}</span></div>` +
    `<button class="chip-x">✕</button>`;
  el("input", row).addEventListener("change", async (e) => {
    const bought = e.target.checked;
    await sb.from("shopping_list_items").update({
      is_bought: bought,
      bought_by: bought ? state.member.id : null,
      bought_at: bought ? new Date().toISOString() : null,
    }).eq("id", it.id);
    // realtime will refresh both clients
  });
  el(".chip-x", row).addEventListener("click", async () => {
    await sb.from("shopping_list_items").delete().eq("id", it.id);
  });
  return row;
}
$("btn-add-manual").addEventListener("click", addManual);
$("manual-item").addEventListener("keydown", (e) => { if (e.key === "Enter") addManual(); });
async function addManual() {
  const name = $("manual-item").value.trim();
  if (!name) return;
  $("manual-item").value = "";
  await sb.from("shopping_list_items").insert({
    household_id: state.household.id, name: name.toLowerCase(),
    category: guessCategory(name), source: "manual",
  });
}

// Regenerate recipe-sourced items from this week's plan (client-side dedupe)
$("btn-regen").addEventListener("click", async () => {
  const start = state.weekStart, end = addDays(start, 6);
  const { data: entries } = await sb.from("meal_plan_entries")
    .select("recipe_id").eq("household_id", state.household.id)
    .gte("date", isoDate(start)).lte("date", isoDate(end)).not("recipe_id", "is", null);

  const recipeIds = [...new Set((entries || []).map((e) => e.recipe_id))];
  if (!recipeIds.length) { alert("No saved recipes planned this week. Add recipes to days first."); return; }

  const { data: ings } = await sb.from("recipe_ingredients").select("*").in("recipe_id", recipeIds);

  // merge by name + unit
  const merged = {};
  (ings || []).forEach((i) => {
    const key = i.name + "|" + (i.unit || "");
    if (!merged[key]) merged[key] = { name: i.name, unit: i.unit, category: i.category || "other", quantity: 0, anyQty: false };
    if (i.quantity != null) { merged[key].quantity += Number(i.quantity); merged[key].anyQty = true; }
  });

  // clear existing recipe-sourced, unbought items; keep manual + already-bought
  await sb.from("shopping_list_items").delete()
    .eq("household_id", state.household.id).eq("source", "recipe").eq("is_bought", false);

  const rows = Object.values(merged).map((m) => ({
    household_id: state.household.id, name: m.name, unit: m.unit,
    quantity: m.anyQty ? m.quantity : null, category: m.category, source: "recipe",
  }));
  if (rows.length) await sb.from("shopping_list_items").insert(rows);

  document.querySelector('.tab[data-tab="list"]').click();
  renderShoppingList();
});

// ----- Settings (rename kitchen / your name) -----
$("btn-settings").addEventListener("click", () => {
  $("settings-hh-name").value = state.household.name;
  $("settings-my-name").value = state.member.display_name;
  $("settings-msg").textContent = "";
  openModal("modal-settings");
});

$("btn-save-settings").addEventListener("click", async () => {
  const newHhName = $("settings-hh-name").value.trim();
  const newMyName = $("settings-my-name").value.trim();
  if (!newHhName || !newMyName) { $("settings-msg").textContent = "Both fields are required."; return; }

  $("settings-msg").textContent = "Saving…";

  if (newHhName !== state.household.name) {
    const { error } = await sb.from("households").update({ name: newHhName }).eq("id", state.household.id);
    if (error) { $("settings-msg").textContent = error.message; return; }
    state.household.name = newHhName;
    $("hh-name").textContent = newHhName;
  }

  if (newMyName !== state.member.display_name) {
    const { error } = await sb.from("members").update({ display_name: newMyName }).eq("id", state.member.id);
    if (error) { $("settings-msg").textContent = error.message; return; }
    state.member.display_name = newMyName;
    $("who").textContent = " · " + newMyName;
    _memberNames = null; // stale cache — refetch next time the shopping list renders "bought by"
  }

  closeModal();
});

// ----- Invite -----
function inviteText() {
  const url = window.location.origin + window.location.pathname;
  const pin = state.household.invite_code;
  return `Join our kitchen on What's for Dinner: ${url}\nWhen it asks for a PIN, enter: ${pin}`;
}

$("btn-invite").addEventListener("click", () => {
  $("invite-code-display").textContent = state.household.invite_code;
  $("invite-copy-msg").textContent = "";

  const text = inviteText();
  $("btn-invite-email").href = "mailto:?subject=" + encodeURIComponent("Join our kitchen") + "&body=" + encodeURIComponent(text);
  $("btn-invite-sms").href = "sms:?body=" + encodeURIComponent(text);

  openModal("modal-invite");
});

$("btn-invite-share").addEventListener("click", async () => {
  const text = inviteText();
  if (navigator.share) {
    try { await navigator.share({ title: "Join our kitchen", text }); }
    catch {} // user cancelled — not an error
  } else {
    await copyInviteText(text);
  }
});

$("btn-invite-copy").addEventListener("click", () => copyInviteText(inviteText()));

async function copyInviteText(text) {
  try {
    await navigator.clipboard.writeText(text);
    $("invite-copy-msg").textContent = "Copied! Paste it wherever you like.";
  } catch {
    $("invite-copy-msg").textContent = "Couldn't copy automatically — select the PIN above and copy it manually.";
  }
}

// =========================================================================
//  Realtime — the anti-double-buying magic
// =========================================================================
function subscribeRealtime() {
  if (state.channel) return;
  state.channel = sb.channel("hh-" + state.household.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_list_items", filter: "household_id=eq." + state.household.id }, renderShoppingList)
    .on("postgres_changes", { event: "*", schema: "public", table: "meal_plan_entries", filter: "household_id=eq." + state.household.id }, renderWeek)
    .subscribe();
}

// ---------- Small utilities ----------
let _memberNames = null;
async function getMemberNames() {
  if (_memberNames) return _memberNames;
  const { data } = await sb.from("members").select("id,display_name").eq("household_id", state.household.id);
  _memberNames = {}; (data || []).forEach((m) => (_memberNames[m.id] = m.display_name));
  return _memberNames;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function trimNum(n) { return Number(n).toString(); }

// Modals
function openModal(id) { $("modal-backdrop").classList.remove("hidden"); document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden")); $(id).classList.remove("hidden"); }
function closeModal() { $("modal-backdrop").classList.add("hidden"); }
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
$("modal-backdrop").addEventListener("click", (e) => { if (e.target === $("modal-backdrop")) closeModal(); });

// ---------- Go ----------
boot();
