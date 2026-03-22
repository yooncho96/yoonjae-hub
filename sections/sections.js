import { api, IDS, prop, pageTitle, nlink, fmtDate, fmtRelative, todayStr, daysUntil } from "./data.js";
import { openPage } from "./viewer.js";

const STEP3_DATE = "2026-05-09";

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
export async function loadSchedule() {
  const t = todayStr();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const data = await api("query", IDS.weeklySchedule, {
    filter: { and: [
      { property: "Date", date: { on_or_after: t } },
      { property: "Date", date: { on_or_before: weekEnd.toISOString().slice(0,10) } },
    ]},
    sorts: [{ property: "Date", direction: "ascending" }],
    page_size: 25,
  });
  return (data.results || []).map(p => ({
    id: p.id,
    title: pageTitle(p),
    date: prop(p, "Date"),
    type: prop(p, "Type") || prop(p, "Rotation") || "",
    time: prop(p, "Time") || prop(p, "Shift Time") || "",
    notes: prop(p, "Notes") || "",
  }));
}

export function renderSchedule(events, container) {
  const t = todayStr();
  const todayEvents   = events.filter(e => e.date === t);
  const upcomingEvents = events.filter(e => e.date > t);

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">today · ${fmtDate(t)}</div>
      <a class="see-all" href="${nlink(IDS.weeklySchedule)}" target="_blank">full calendar ↗</a>
    </div>
    <div class="event-list">
      ${todayEvents.length
        ? todayEvents.map(e => eventRow(e)).join("")
        : `<div class="empty-state">Nothing logged for today — off day or not yet synced.</div>`}
    </div>
    <div class="shift-divider"></div>
    <div class="upcoming-label">this week</div>
    <div class="shift-list">
      ${upcomingEvents.slice(0,7).map(e => shiftRow(e)).join("")}
    </div>
  `;

  // Each event row opens the page in the viewer when clicked
  container.querySelectorAll("[data-page-id]").forEach(el =>
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.title))
  );
}

function accentClass(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("ed") || s.includes("em") || s.includes("shift") || s.includes("green") || s.includes("blue")) return "accent-clinical";
  if (s.includes("dbt") || s.includes("zoom") || s.includes("deborah")) return "accent-dbt";
  if (s.includes("uworld") || s.includes("step") || s.includes("study")) return "accent-admin";
  if (s.includes("mimic") || s.includes("pumpkin") || s.includes("pet")) return "accent-personal";
  if (s.includes("wave") || s.includes("research") || s.includes("lab")) return "accent-research";
  return "accent-personal";
}

function eventRow(e) {
  return `
    <div class="event-item event-clickable" data-page-id="${e.id}" data-title="${e.title}" title="Click to read">
      <div class="event-time">${e.time || "—"}</div>
      <div class="event-body">
        <div class="event-name">
          <span class="event-accent ${accentClass(e.title + e.type)}"></span>
          ${e.title}
        </div>
        ${e.notes ? `<div class="event-sub">${e.notes}</div>` : ""}
      </div>
    </div>`;
}

function shiftRow(e) {
  const t = (e.title + " " + (e.type || "")).toLowerCase();
  let badge = "badge-off", label = "off";
  if (t.includes("ed") || t.includes("em") || t.includes("green") || t.includes("blue")) { badge = "badge-em"; label = "EM"; }
  else if (t.includes("psych") || t.includes("inpatient")) { badge = "badge-psych"; label = "Psych"; }
  return `
    <div class="shift-row">
      <span class="shift-row-day">${fmtDate(e.date)}</span>
      <span class="shift-row-type">${e.title}</span>
      <span class="shift-row-badge ${badge}">${label}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3
// ─────────────────────────────────────────────────────────────────────────────
export async function loadStep3() {
  const data = await api("query", IDS.uworldTracker, {
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 100,
  });
  const rows = data.results || [];
  // Distinguish completed vs planned sessions by checking a "Type" or "Mode" property
  const done    = rows.filter(r => !["Planned","planned"].includes(prop(r,"Type") || prop(r,"Mode") || ""));
  const planned = rows.filter(r =>  ["Planned","planned"].includes(prop(r,"Type") || prop(r,"Mode") || ""));
  const totalQs = done.reduce((s, r) => s + (prop(r,"Questions") || prop(r,"Qs") || 0), 0);
  const correct = done.reduce((s, r) => s + (prop(r,"Correct") || 0), 0);
  const lastDate = done[0] ? (prop(done[0],"Date") || prop(done[0],"Session Date")) : null;

  return {
    doneSessions: done.length,
    plannedSessions: planned.length,
    totalQs,
    pctCorrect: totalQs > 0 ? Math.round(correct / totalQs * 100) : null,
    lastDate,
    daysLeft: daysUntil(STEP3_DATE),
  };
}

export function renderStep3(d, container) {
  const progress = d.doneSessions + d.plannedSessions > 0
    ? Math.min(100, Math.round(d.doneSessions / (d.doneSessions + d.plannedSessions) * 100))
    : 0;

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">step 3 · may 9–11</div>
      <a class="see-all" href="${nlink(IDS.uworldTracker)}" target="_blank">tracker ↗</a>
    </div>
    <div class="stat-row">
      <div class="stat-item"><span class="stat-val">${d.daysLeft}</span><span class="stat-lbl">days left</span></div>
      <div class="stat-item"><span class="stat-val">${d.doneSessions}</span><span class="stat-lbl">sessions done</span></div>
      ${d.pctCorrect !== null
        ? `<div class="stat-item"><span class="stat-val">${d.pctCorrect}%</span><span class="stat-lbl">accuracy</span></div>`
        : ""}
    </div>
    <div class="mini-bar-wrap"><div class="mini-bar-fill" style="width:${progress}%"></div></div>
    <div class="mini-prog-label">
      <span>${d.doneSessions} done · ${d.plannedSessions} planned</span>
      ${d.lastDate ? `<span>last ${fmtDate(d.lastDate)}</span>` : ""}
    </div>
    <div class="btn-row" style="margin-top:12px;">
      <a class="fc-btn fc-primary" href="${nlink(IDS.uworldTracker)}" target="_blank">log session ↗</a>
      <a class="fc-btn" href="${nlink(IDS.step3Review)}" target="_blank">study plan ↗</a>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────
export async function loadTasks() {
  const data = await api("query", IDS.taskBoard, {
    filter: { property: "Status", status: { does_not_equal: "Done" } },
    sorts: [{ property: "Priority", direction: "descending" }],
    page_size: 30,
  });
  return (data.results || []).map(r => ({
    id: r.id,
    title: pageTitle(r),
    status: prop(r, "Status"),
    priority: prop(r, "Priority"),
    category: prop(r, "Category"),
    due: prop(r, "Due Date"),
  }));
}

export function renderTasks(tasks, container) {
  const t = todayStr();
  const overdue  = tasks.filter(x => x.due && x.due < t);
  const dueToday = tasks.filter(x => x.due === t);
  const rest     = tasks.filter(x => !x.due || x.due > t);
  const shown    = [...overdue, ...dueToday, ...rest].slice(0, 7);

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">tasks <span class="count-badge">${tasks.length}</span></div>
      <a class="see-all" href="${nlink(IDS.taskBoard)}" target="_blank">board ↗</a>
    </div>
    ${shown.length === 0
      ? `<div class="empty-state">All clear.</div>`
      : shown.map(task => `
          <div class="mini-row task-row event-clickable" data-page-id="${task.id}" data-title="${task.title}">
            <span class="mini-label ${task.due && task.due < t ? "overdue" : task.due === t ? "due-today" : ""}">${task.title}</span>
            <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
              ${task.priority ? `<span class="priority-dot priority-${(task.priority||"").toLowerCase()}"></span>` : ""}
              <span class="mini-val">${task.due ? fmtDate(task.due) : (task.status || "")}</span>
            </div>
          </div>`).join("")}
  `;

  container.querySelectorAll("[data-page-id]").forEach(el =>
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.title))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH
// ─────────────────────────────────────────────────────────────────────────────
export async function loadResearch() {
  const [res, wave] = await Promise.all([
    api("query", IDS.researchPipeline, { page_size: 20 }),
    api("query", IDS.waveTracker,      { page_size: 30 }),
  ]);
  const manuscripts = (res.results || []).map(r => ({
    id: r.id, title: pageTitle(r), status: prop(r,"Status"),
  }));
  const waveActive = (wave.results || []).filter(r => {
    const s = (prop(r,"Status") || "").toLowerCase();
    return s.includes("progress") || s.includes("active");
  }).length;
  return { manuscripts, waveActive, waveTotal: wave.results?.length || 0 };
}

export function renderResearch({ manuscripts, waveActive, waveTotal }, container) {
  const statusSlug = s => (s||"").toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">research</div>
      <a class="see-all" href="${nlink(IDS.researchPipeline)}" target="_blank">pipeline ↗</a>
    </div>
    ${manuscripts.slice(0,5).map(m => `
      <div class="mini-row event-clickable" data-page-id="${m.id}" data-title="${m.title}">
        <span class="mini-label">${m.title}</span>
        ${m.status ? `<span class="status-badge status-${statusSlug(m.status)}">${m.status}</span>` : ""}
      </div>`).join("")}
    <div class="shift-divider" style="margin:10px 0;"></div>
    <div class="mini-row">
      <span class="mini-label">🌊 WAVE</span>
      <a class="mini-val" href="${nlink(IDS.waveTracker)}" target="_blank">${waveActive} active · ${waveTotal} total ↗</a>
    </div>
  `;

  container.querySelectorAll("[data-page-id]").forEach(el =>
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.title))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PETS
// ─────────────────────────────────────────────────────────────────────────────
export async function loadPets() {
  const data = await api("query", IDS.petCareLog, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: 10,
  });
  return (data.results || []).map(r => ({
    id: r.id,
    title: pageTitle(r),
    date: prop(r, "Date"),
    notes: prop(r, "Notes"),
  }));
}

export function renderPets(logs, container) {
  const mimic   = logs.find(l => l.title?.toLowerCase().includes("mimic"));
  const pumpkin = logs.find(l => l.title?.toLowerCase().includes("pumpkin"));

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">🐾 mimic & pumpkin</div>
      <a class="see-all" href="${nlink(IDS.petCareLog)}" target="_blank">log ↗</a>
    </div>
    <div class="pet-row">
      <span class="pet-name">Mimic</span>
      <span class="pet-meta">${mimic?.date ? fmtRelative(mimic.date) : "no log"}</span>
      <a class="fc-btn" href="${nlink(IDS.petCareLog)}" target="_blank">+ log ↗</a>
    </div>
    <div class="pet-row">
      <span class="pet-name">Pumpkin</span>
      <span class="pet-meta">${pumpkin?.date ? fmtRelative(pumpkin.date) : "no log"}</span>
      <a class="fc-btn" href="${nlink(IDS.petCareLog)}" target="_blank">+ log ↗</a>
    </div>
  `;
}
