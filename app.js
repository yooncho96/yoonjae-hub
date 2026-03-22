import { daysUntil, IDS } from "./sections/data.js";
import { initViewer } from "./sections/viewer.js";
import { initAddForm } from "./sections/addform.js";
import { loadPsychiatryMatrix, renderPsychiatryMatrix } from "./sections/psychiatry.js";
import {
  loadSchedule,  renderSchedule,
  loadStep3,     renderStep3,
  loadTasks,     renderTasks,
  loadResearch,  renderResearch,
  loadPets,      renderPets,
} from "./sections/sections.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// LOAD ALL SECTIONS CONCURRENTLY
// Each section loads independently so a slow Notion query in one section
// doesn't block the others from rendering.
// ─────────────────────────────────────────────────────────────────────────────
const sections = [
  {
    load: loadSchedule,
    render: renderSchedule,
    containerId: "card-schedule",
    label: "Schedule",
  },
  {
    load: loadPsychiatryMatrix,
    render: renderPsychiatryMatrix,
    containerId: "card-psychiatry",
    label: "Psychiatry",
  },
  {
    load: loadStep3,
    render: renderStep3,
    containerId: "card-step3",
    label: "Step 3",
  },
  {
    load: loadTasks,
    render: (data, el) => { renderTasks(data, el); updateSubhead(data); },
    containerId: "card-tasks",
    label: "Tasks",
  },
  {
    load: loadResearch,
    render: renderResearch,
    containerId: "card-research",
    label: "Research",
  },
  {
    load: loadPets,
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
        </div>
        <a class="fc-btn" style="margin-top:10px;display:inline-block;"
           href="https://www.notion.so/${IDS[label.toLowerCase()] || ""}" target="_blank">
          open in notion ↗
        </a>`;
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBHEAD — shows a contextual summary once tasks load
// ─────────────────────────────────────────────────────────────────────────────
function updateSubhead(tasks) {
  const t = new Date().toISOString().slice(0,10);
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
// MOOD CHIPS
// ─────────────────────────────────────────────────────────────────────────────
const MOODS = {
  grounded: "Solid footing. Good day to push through something hard.",
  tired:    "Rest is part of the work. Protect your margins today.",
  scattered:"Worth naming before the day gets away from you.",
  okay:     "Okay is enough right now.",
};
window.selectMood = (el, key) => {
  document.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  const n = document.getElementById("mood-note");
  if (n) n.textContent = MOODS[key] || "";
};
