import { daysUntil, IDS, api, todayStr } from "./sections/data.js";
import { initViewer } from "./sections/viewer.js";
import { initAddForm } from "./sections/addform.js";
import { loadPsychiatryMatrix, renderPsychiatryMatrix } from "./sections/psychiatry.js";
import {
  loadSchedule,  renderSchedule,
  loadStep3,     renderStep3,
  loadTasks,     renderTasks,
  loadResearch,  renderResearch,
} from "./sections/sections.js";
import { loadPets, renderPets } from "./sections/pets.js";

// Initialize all shared UI systems first
initViewer();
initAddForm(document.getElementById("add-page-btn"));

// Update the Step 3 countdown chip immediately
const chip = document.getElementById("chip-step3");
if (chip) chip.textContent = `Step 3 · ${daysUntil("2026-05-09")}d`;

// Update time-of-day greeting
const h = new Date().getHours();
const tod = document.getElementById("time-of-day");
if (tod) tod.textContent = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

// Date string in the top bar
const qlDate = document.getElementById("ql-date");
if (qlDate) qlDate.textContent = new Date().toLocaleDateString("en-US", {
  weekday: "short", month: "short", day: "numeric"
});

// Refresh button
const refreshBtn = document.getElementById("ql-refresh-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("spinning");
    setTimeout(() => location.reload(), 300);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW TAB SWITCHING (Home ↔ Knowledge)
// ─────────────────────────────────────────────────────────────────────────────
document.querySelectorAll(".view-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const view = tab.dataset.view;
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`view-${view}`)?.classList.add("active");
    try { localStorage.setItem("hub:activeView", view); } catch {}
  });
});

// Restore last view
try {
  const lastView = localStorage.getItem("hub:activeView");
  if (lastView) document.querySelector(`.view-tab[data-view="${lastView}"]`)?.click();
} catch {}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE CACHE — wraps load functions with 15-min localStorage cache
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;

function withCache(key, fn) {
  return async (...args) => {
    const cacheKey = `hub:cache:${key}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { v, t } = JSON.parse(raw);
        if (Date.now() - t < CACHE_TTL) return v;
      }
    } catch {}
    const result = await fn(...args);
    try { localStorage.setItem(cacheKey, JSON.stringify({ v: result, t: Date.now() })); } catch {}
    return result;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD ALL SECTIONS CONCURRENTLY
// ─────────────────────────────────────────────────────────────────────────────
const sections = [
  {
    load: withCache("schedule", loadSchedule),
    render: renderSchedule,
    containerId: "card-schedule",
    label: "Schedule",
  },
  {
    load: withCache("psychiatry", loadPsychiatryMatrix),
    render: renderPsychiatryMatrix,
    containerId: "card-psychiatry",
    label: "Psychiatry",
  },
  {
    load: loadStep3,                  // never cache — exam tracker should be fresh
    render: renderStep3,
    containerId: "card-step3",
    label: "Step 3",
  },
  {
    load: loadTasks,                  // never cache — task freshness matters
    render: (data, el) => { renderTasks(data, el); updateSubhead(data); },
    containerId: "card-tasks",
    label: "Tasks",
  },
  {
    load: withCache("research", loadResearch),
    render: renderResearch,
    containerId: "card-research",
    label: "Research",
  },
  {
    load: withCache("pets", loadPets),
    render: renderPets,
    containerId: "card-pets",
    label: "Pets",
  },
];

sections.forEach(({ load, render, containerId, label }) => {
  const el = document.getElementById(containerId);
  if (!el) return;
  load()
    .then(data => render(data, el))
    .catch(err => {
      el.innerHTML = `
        <div class="card-label">${label.toLowerCase()}</div>
        <div class="empty-state" style="color:var(--red-500);">
          Failed to load — check that you shared this database with your Notion integration.<br>
          <small style="color:var(--sand-400);font-style:normal;">${err.message}</small>
        </div>`;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBHEAD — contextual summary once tasks load
// ─────────────────────────────────────────────────────────────────────────────
function updateSubhead(tasks) {
  const t = todayStr();
  const overdue  = tasks.filter(x => x.due && x.due < t).length;
  const dueToday = tasks.filter(x => x.due === t).length;
  const el = document.getElementById("cc-subhead");
  if (!el) return;
  const parts = [];
  if (overdue  > 0) parts.push(`${overdue} overdue`);
  if (dueToday > 0) parts.push(`${dueToday} due today`);
  if (parts.length === 0) parts.push(tasks.length > 0 ? `${tasks.length} open tasks` : "all clear");
  el.textContent = parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// WELLBEING CHECK-IN
// ─────────────────────────────────────────────────────────────────────────────
const MOOD_NOTES = {
  grounded: "Solid footing. Good day to push through something hard.",
  tired:    "Rest is part of the work. Protect your margins today.",
  scattered:"Worth naming before the day gets away from you.",
  okay:     "Okay is enough right now.",
};

// Wire chip interactions: select/multi/checkbox
document.querySelectorAll(".wb-chips").forEach(group => {
  const type = group.dataset.type;
  if (type === "none") return; // handled separately (checkboxes below)

  group.querySelectorAll(".mood-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (type === "multi") {
        chip.classList.toggle("selected");
      } else {
        group.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        // mood note
        if (group.dataset.field === "mood") {
          const note = document.getElementById("wb-status");
          if (note && !note.textContent.includes("saved")) {
            note.textContent = MOOD_NOTES[chip.dataset.val] || "";
          }
        }
      }
    });
  });
});

// Checkbox meds chips (toggle with ☐/☑ label)
const MEDS_LABELS = { morning_meds: "am", night_meds: "pm" };
document.querySelectorAll(".wb-check").forEach(chip => {
  chip.addEventListener("click", () => {
    const checked = chip.classList.toggle("selected");
    chip.textContent = (checked ? "☑" : "☐") + " " + (MEDS_LABELS[chip.dataset.field] || chip.dataset.field);
  });
});

// Save check-in to Notion wellbeing DB
document.getElementById("wellbeing-save-btn")?.addEventListener("click", async () => {
  const saveBtn = document.getElementById("wellbeing-save-btn");
  const statusEl = document.getElementById("wb-status");

  function getSelect(field) {
    const el = document.querySelector(`.wb-chips[data-field="${field}"] .mood-chip.selected`);
    return el?.dataset.val || null;
  }
  function getMulti(field) {
    return [...document.querySelectorAll(`.wb-chips[data-field="${field}"] .mood-chip.selected`)]
      .map(c => c.dataset.val);
  }
  function getCheck(field) {
    return document.querySelector(`.wb-check[data-field="${field}"]`)?.classList.contains("selected") || false;
  }

  const today = todayStr();
  const mood    = getSelect("mood");
  const sleep   = getSelect("sleep");
  const SI      = getSelect("SI");
  const meals   = getMulti("meals");
  const snacks  = getMulti("snacks");
  const mornMeds = getCheck("morning_meds");
  const nightMeds = getCheck("night_meds");

  const properties = {
    "title of day": { title: [{ text: { content: today } }] },
    "date":         { date: { start: today } },
    "morning meds": { checkbox: mornMeds },
    "yesterday night meds": { checkbox: nightMeds },
    "meals":        { multi_select: meals.map(n => ({ name: n })) },
    "snacks":       { multi_select: snacks.map(n => ({ name: n })) },
  };
  if (mood)  properties["mood"]  = { select: { name: mood } };
  if (sleep) properties["sleep"] = { select: { name: sleep } };
  if (SI)    properties["SI"]    = { select: { name: SI } };

  saveBtn.textContent = "saving…";
  saveBtn.style.pointerEvents = "none";
  try {
    await api("create", IDS.wellbeingDb, { parent: { database_id: IDS.wellbeingDb }, properties });
    statusEl.style.color = "var(--moss-700)";
    statusEl.textContent = "saved ✓";
    saveBtn.textContent = "saved ✓";
    setTimeout(() => {
      saveBtn.textContent = "save →";
      saveBtn.style.pointerEvents = "";
    }, 2000);
  } catch (err) {
    statusEl.style.color = "var(--red-500)";
    statusEl.textContent = `Failed: ${err.message}`;
    saveBtn.textContent = "save →";
    saveBtn.style.pointerEvents = "";
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE CARDS — event delegation so it works on dynamically rendered cards
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("click", e => {
  // Only trigger on the label text itself, not on badges/buttons inside it
  const label = e.target.closest(".card-label");
  if (!label) return;
  // Don't collapse if the click was on a child button/link inside the label
  if (e.target !== label && (e.target.tagName === "A" || e.target.tagName === "BUTTON")) return;
  const card = label.closest(".card");
  if (!card) return;
  card.classList.toggle("collapsed");
  const key = `hub:collapsed:${card.id || label.textContent.trim().slice(0, 30)}`;
  try { localStorage.setItem(key, card.classList.contains("collapsed") ? "1" : "0"); } catch {}
});

// Restore collapsed state for static cards (wellbeing is the only static one)
try {
  document.querySelectorAll(".card[id]").forEach(card => {
    const label = card.querySelector(".card-label");
    if (!label) return;
    const key = `hub:collapsed:${card.id}`;
    if (localStorage.getItem(key) === "1") card.classList.add("collapsed");
  });
} catch {}
