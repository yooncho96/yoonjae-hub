import { api, IDS, prop, pageTitle, nlink, fmtDate, fmtRelative, todayStr, daysUntil } from "./data.js";
import { openPage } from "./viewer.js";

const STEP3_DATE = "2026-05-09";
// Total UWorld questions — adjust as needed
const STEP3_GOAL = (() => {
  try { return parseInt(localStorage.getItem("hub:step3goal") || "3200", 10) || 3200; } catch { return 3200; }
})();

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
  const t = todayStr();
  const data = await api("query", IDS.uworldTracker, {
    sorts: [{ property: "Date", direction: "ascending" }],
    page_size: 100,
  });
  const rows = data.results || [];

  // Only rows with the "Done" checkbox checked count toward totals
  const done = rows.filter(r => prop(r, "Done") === true);

  const totalQs = done.reduce((s, r) => s + (prop(r, "Qs") || 0), 0);

  const scoredRows = done.filter(r => prop(r, "Score") !== null);
  const avgScore = scoredRows.length > 0
    ? Math.round(scoredRows.reduce((s, r) => s + prop(r, "Score"), 0) / scoredRows.length)
    : null;

  // todayRow searches ALL rows so you can still log score even if Done not yet checked
  const todayRow = rows.find(r => prop(r, "Date") === t) || null;

  return {
    totalQs,
    avgScore,
    daysLeft: daysUntil(STEP3_DATE),
    doneSessions: done.length,
    goal: STEP3_GOAL,
    todayRow: todayRow ? {
      id:      todayRow.id,
      done:    prop(todayRow, "Done") === true,
      subject: prop(todayRow, "Subject") || "",
      qs:      prop(todayRow, "Qs") || "",
      notes:   prop(todayRow, "Notes") || "",
      score:   prop(todayRow, "Score"),
    } : null,
  };
}

export function renderStep3(d, container) {
  const progress = Math.min(100, Math.round((d.totalQs / d.goal) * 100));

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">step 3 · may 9–11</div>
      <a class="see-all" href="${nlink(IDS.uworldTracker)}" target="_blank">tracker ↗</a>
    </div>
    <div class="stat-row">
      <div class="stat-item">
        <span class="stat-val">${d.daysLeft}</span>
        <span class="stat-lbl">days left</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">${d.totalQs.toLocaleString()}</span>
        <span class="stat-lbl">Qs done</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">${d.avgScore !== null ? d.avgScore + "%" : "—"}</span>
        <span class="stat-lbl">avg score</span>
      </div>
    </div>
    <div class="mini-bar-wrap"><div class="mini-bar-fill" style="width:${progress}%"></div></div>
    <div class="mini-prog-label">
      <span>${d.totalQs.toLocaleString()} Qs · ${d.doneSessions} sessions</span>
      <span>
        <span class="s3-goal-val" title="Click to edit goal">${d.goal.toLocaleString()} total</span>
      </span>
    </div>

    <!-- Today's session info + log score button -->
    <div class="step3-today-row" id="step3-today-row">
      ${!d.todayRow
        ? `<div class="step3-today-info s3-empty">no session today</div>
           <button class="fc-btn fc-primary" id="step3-log-btn">log score</button>`
        : d.todayRow.done
          ? `<div class="step3-today-info">
               ${d.todayRow.subject ? `<span class="s3-subject">${d.todayRow.subject}</span>` : ""}
               <span class="s3-detail">
                 ${d.todayRow.qs ? `${d.todayRow.qs} Qs` : ""}
                 ${d.todayRow.score !== null && d.todayRow.score !== undefined ? ` · ${d.todayRow.score}%` : ""}
               </span>
             </div>
             <span class="s3-done-badge">done ✓</span>`
          : `<div class="step3-today-info">
               ${d.todayRow.subject ? `<span class="s3-subject">${d.todayRow.subject}</span>` : ""}
               ${d.todayRow.qs      ? `<span class="s3-detail">${d.todayRow.qs} Qs</span>` : ""}
               ${d.todayRow.notes   ? `<span class="s3-detail s3-notes">${d.todayRow.notes}</span>` : ""}
             </div>
             <button class="fc-btn fc-primary" id="step3-log-btn">
               ${d.todayRow.score !== null && d.todayRow.score !== undefined
                 ? `score: ${d.todayRow.score}% ✓`
                 : "log score"}
             </button>`}
    </div>

    <!-- Inline score input — hidden until button clicked -->
    <div class="step3-score-input" id="step3-score-input" style="display:none;">
      <input type="number" min="0" max="100" placeholder="Score %" id="step3-score-val"
             class="form-input" style="width:90px;"/>
      <button class="fc-btn fc-primary" id="step3-score-save">save</button>
      <button class="fc-btn" id="step3-score-cancel">cancel</button>
      <span class="step3-save-msg" id="step3-save-msg"></span>
    </div>

    <!-- Goal editor — hidden until clicked -->
    <div class="step3-score-input" id="step3-goal-input" style="display:none;">
      <input type="number" min="100" placeholder="Total Qs goal" id="step3-goal-val"
             class="form-input" style="width:120px;" value="${d.goal}"/>
      <button class="fc-btn fc-primary" id="step3-goal-save">set goal</button>
      <button class="fc-btn" id="step3-goal-cancel">cancel</button>
    </div>
  `;

  // Wire up log score flow (logBtn absent when session is marked Done)
  const logBtn     = document.getElementById("step3-log-btn");
  const inputRow   = document.getElementById("step3-score-input");
  const scoreInput = document.getElementById("step3-score-val");
  const saveBtn    = document.getElementById("step3-score-save");
  const cancelBtn  = document.getElementById("step3-score-cancel");
  const saveMsg    = document.getElementById("step3-save-msg");

  if (logBtn) {
    logBtn.addEventListener("click", () => {
      if (!d.todayRow) { window.open(nlink(IDS.uworldTracker), "_blank"); return; }
      inputRow.style.display = "flex";
      logBtn.style.display = "none";
      scoreInput.focus();
      if (d.todayRow.score !== null) scoreInput.value = d.todayRow.score;
    });
  }

  cancelBtn.addEventListener("click", () => {
    inputRow.style.display = "none";
    logBtn.style.display = "";
    saveMsg.textContent = "";
  });

  saveBtn.addEventListener("click", async () => {
    const val = parseFloat(scoreInput.value);
    if (isNaN(val) || val < 0 || val > 100) {
      saveMsg.textContent = "Enter 0–100";
      saveMsg.style.color = "var(--red-500)";
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    saveMsg.textContent = "";
    try {
      await api("update", d.todayRow.id, { properties: { Score: { number: val } } });
      logBtn.textContent = `score: ${val}% ✓`;
      d.todayRow.score = val;
      inputRow.style.display = "none";
      logBtn.style.display = "";
    } catch (err) {
      saveMsg.textContent = `Failed: ${err.message}`;
      saveMsg.style.color = "var(--red-500)";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "save";
    }
  });

  scoreInput.addEventListener("keydown", e => {
    if (e.key === "Enter") saveBtn.click();
    if (e.key === "Escape") cancelBtn.click();
  });

  // Wire up editable goal
  const goalValEl   = container.querySelector(".s3-goal-val");
  const goalInput   = document.getElementById("step3-goal-input");
  const goalValInput = document.getElementById("step3-goal-val");
  const goalSaveBtn  = document.getElementById("step3-goal-save");
  const goalCancelBtn = document.getElementById("step3-goal-cancel");

  goalValEl.style.cursor = "pointer";
  goalValEl.addEventListener("click", () => {
    goalInput.style.display = "flex";
    goalValEl.parentElement.style.display = "none";
    goalValInput.focus();
  });
  goalCancelBtn.addEventListener("click", () => {
    goalInput.style.display = "none";
    goalValEl.parentElement.style.display = "";
  });
  goalSaveBtn.addEventListener("click", () => {
    const g = parseInt(goalValInput.value, 10);
    if (g > 0) {
      try { localStorage.setItem("hub:step3goal", String(g)); } catch {}
      goalValEl.textContent = `${g.toLocaleString()} total`;
      // Update bar
      const newProgress = Math.min(100, Math.round((d.totalQs / g) * 100));
      const fill = container.querySelector(".mini-bar-fill");
      if (fill) fill.style.width = newProgress + "%";
    }
    goalInput.style.display = "none";
    goalValEl.parentElement.style.display = "";
  });
  goalValInput.addEventListener("keydown", e => {
    if (e.key === "Enter") goalSaveBtn.click();
    if (e.key === "Escape") goalCancelBtn.click();
  });
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

  function taskGroup(label, items) {
    if (!items.length) return "";
    return `
      <div class="task-group-label">${label} <span class="task-group-count">${items.length}</span></div>
      ${items.map(task => taskRow(task, t)).join("")}`;
  }

  const shown = [...overdue, ...dueToday, ...rest].slice(0, 10);
  const overdueShown  = shown.filter(x => x.due && x.due < t);
  const todayShown    = shown.filter(x => x.due === t);
  const restShown     = shown.filter(x => !x.due || x.due > t);

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">tasks <span class="count-badge">${tasks.length}</span></div>
      <a class="see-all" href="${nlink(IDS.taskBoard)}" target="_blank">board ↗</a>
    </div>
    ${shown.length === 0
      ? `<div class="empty-state">All clear.</div>`
      : `${taskGroup("overdue", overdueShown)}${taskGroup("today", todayShown)}${taskGroup("upcoming", restShown)}`}
  `;

  // Quick-complete buttons
  container.querySelectorAll(".task-done-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const row = btn.closest("[data-page-id]");
      const id = row?.dataset.pageId;
      if (!id) return;
      btn.textContent = "…";
      btn.disabled = true;
      try {
        await api("update", id, { properties: { Status: { status: { name: "Done" } } } });
        row.style.opacity = "0.4";
        row.style.pointerEvents = "none";
        btn.textContent = "✓";
      } catch {
        btn.textContent = "✕";
        btn.disabled = false;
      }
    });
  });

  // Click row to open page
  container.querySelectorAll("[data-page-id]").forEach(el =>
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.title))
  );
}

function taskRow(task, today) {
  const urgency = task.due && task.due < today ? "overdue"
                : task.due === today           ? "due-today"
                : "";
  return `
    <div class="mini-row task-row event-clickable" data-page-id="${task.id}" data-title="${task.title}">
      <button class="task-done-btn" title="Mark done">○</button>
      <span class="mini-label ${urgency}">${task.title}</span>
      <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
        ${task.priority ? `<span class="priority-dot priority-${(task.priority||"").toLowerCase()}"></span>` : ""}
        <span class="mini-val">${task.due ? fmtDate(task.due) : (task.status || "")}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH
// ─────────────────────────────────────────────────────────────────────────────
export async function loadResearch() {
  const [res, wave] = await Promise.all([
    api("query", IDS.researchPipeline, { page_size: 20 }),
    api("query", IDS.waveTracker,      { page_size: 100 }),
  ]);
  const manuscripts = (res.results || []).map(r => ({
    id: r.id, title: pageTitle(r), status: prop(r, "Status"),
  }));

  // WAVE breakdown by status
  const waveByStatus = {};
  (wave.results || []).forEach(r => {
    const s = prop(r, "Status") || "unknown";
    waveByStatus[s] = (waveByStatus[s] || 0) + 1;
  });

  return { manuscripts, waveByStatus, waveTotal: wave.results?.length || 0 };
}

export function renderResearch({ manuscripts, waveByStatus, waveTotal }, container) {
  const statusSlug = s => (s||"").toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");

  // Group manuscripts by pipeline stage
  const byStatus = {};
  manuscripts.forEach(m => {
    const s = m.status || "Other";
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(m);
  });

  const manuscriptHtml = Object.entries(byStatus).map(([status, items]) => `
    <div class="research-group-label">${status}</div>
    ${items.map(m => `
      <div class="mini-row event-clickable" data-page-id="${m.id}" data-title="${m.title}">
        <span class="mini-label">${m.title}</span>
        <span class="status-badge status-${statusSlug(m.status)}">${m.status}</span>
      </div>`).join("")}
  `).join("") || `<div class="empty-state">No manuscripts.</div>`;

  // WAVE summary pills
  const waveEntries = Object.entries(waveByStatus).sort((a, b) => b[1] - a[1]);
  const wavePills = waveEntries.map(([s, n]) =>
    `<span class="wave-pill wave-${statusSlug(s)}">${s} <b>${n}</b></span>`
  ).join("");

  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">research</div>
      <a class="see-all" href="${nlink(IDS.researchPipeline)}" target="_blank">pipeline ↗</a>
    </div>
    ${manuscriptHtml}
    <div class="shift-divider" style="margin:10px 0;"></div>
    <div class="mini-row" style="flex-wrap:wrap;gap:6px;padding-bottom:4px;">
      <a class="mini-label" href="${nlink(IDS.waveTracker)}" target="_blank" style="opacity:1;">🌊 WAVE · ${waveTotal} total</a>
    </div>
    <div class="wave-pills">${wavePills}</div>
  `;

  container.querySelectorAll("[data-page-id]").forEach(el =>
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.title))
  );
}
