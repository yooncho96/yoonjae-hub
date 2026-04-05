import { api, IDS, prop, pageTitle, nlink, fmtDate, todayStr } from "./data.js";

const MAIL_PROXY =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api/mail"
    : "https://yoonjae-hub.vercel.app/api/mail";

// ── Storage helpers ────────────────────────────────────────────────────────
const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
  priorityKey: (id) => `hub:triage:priority:${id}`,
  doneKey:     (id) => `hub:triage:done:${id}`,
  abortedKey:  (id) => `hub:triage:aborted:${id}`,
};

// ── Priority auto-triage ───────────────────────────────────────────────────
function autoTriage(item) {
  if (item.type === "email") {
    const L = item.labelIds || [];
    const starred   = L.includes("STARRED");
    const important = L.includes("IMPORTANT");
    if (starred && important) return "stat";
    if (starred)              return "asap";
    return "routine";
  }
  // Notion task
  const p = (item.priority || "").toLowerCase();
  if (p === "critical" || p === "high")   return "stat";
  if (p === "medium")                      return "asap";
  return "routine";
}

function effectivePriority(item) {
  const override = LS.get(LS.priorityKey(item.id));
  return override || item.origPriority;
}

// ── Load data ──────────────────────────────────────────────────────────────
async function fetchEmails() {
  try {
    const res = await fetch(`${MAIL_PROXY}?op=fetch`);
    if (!res.ok) return { emails: [], gmailAvailable: false, researchAvailable: false };
    return res.json();
  } catch {
    return { emails: [], gmailAvailable: false, researchAvailable: false };
  }
}

async function fetchTasks() {
  try {
    const data = await api("query", IDS.taskBoard, {
      filter: { property: "Status", status: { does_not_equal: "Done" } },
      sorts: [{ property: "Priority", direction: "descending" }],
      page_size: 30,
    });
    return (data.results || []).map(r => ({
      id: r.id,
      type: "task",
      account: "notion",
      title: pageTitle(r),
      from: prop(r, "Category") || "",
      date: prop(r, "Due Date") || "",
      snippet: prop(r, "Status") || "",
      mailLink: null,
      notionId: r.id,
      labelIds: [],
      priority: prop(r, "Priority"),
    }));
  } catch {
    return [];
  }
}

export async function loadTriage() {
  const [emailData, tasks] = await Promise.all([fetchEmails(), fetchTasks()]);
  const { emails = [], gmailAvailable, researchAvailable } = emailData;
  const allItems = [...emails, ...tasks].map(item => ({
    ...item,
    origPriority: autoTriage(item),
  }));
  return { items: allItems, gmailAvailable, researchAvailable };
}

// ── API actions ────────────────────────────────────────────────────────────
async function mailAction(op, item) {
  if (item.type !== "email") return;
  try {
    await fetch(MAIL_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op,
        messageId: item.id.startsWith("ut:") ? item.id.replace("ut:", "") : item.id,
        account: item.account,
        osaMsgId: item.osaMsgId || null,
      }),
    });
  } catch {}
}

async function notionComplete(item, undo = false) {
  if (item.type !== "task") return;
  try {
    await api("update", item.id, {
      properties: {
        Status: { status: { name: undo ? "In Progress" : "Done" } },
      },
    });
  } catch {}
}

const PRIORITY_MAP = { stat: "High", asap: "Medium", routine: "Low" };

async function notionSetPriority(item, priority) {
  if (item.type !== "task") return;
  try {
    await api("update", item.id, {
      properties: {
        Priority: { select: { name: PRIORITY_MAP[priority] || "Low" } },
      },
    });
  } catch {}
}

// ── Format date for display ────────────────────────────────────────────────
function fmtEmailDate(raw) {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function fmtFrom(raw) {
  if (!raw) return "";
  // "Name <email>" → "Name"
  const m = raw.match(/^"?([^"<]+)"?\s*(?:<.+>)?$/);
  return m ? m[1].trim() : raw.split("@")[0];
}

// ── Render a single card ───────────────────────────────────────────────────
function renderCard(item, inArchive = false) {
  const accountLabel = { personal: "personal", research: "research", notion: "notion" }[item.account] || item.account;
  const accountClass = { personal: "badge-personal", research: "badge-research", notion: "badge-notion" }[item.account] || "";
  const dateStr = item.type === "email" ? fmtEmailDate(item.date) : fmtDate(item.date);
  const fromStr = item.type === "email" ? fmtFrom(item.from) : item.from;
  const openBtn = item.type === "email" && item.mailLink
    ? `<a href="${item.mailLink}" class="tc-action-btn tc-open-btn" title="Open in Mail">Open ↗</a>`
    : item.type === "task" && item.notionId
      ? `<a href="${nlink(item.notionId)}" target="_blank" class="tc-action-btn tc-open-btn" title="Open in Notion">Open ↗</a>`
      : "";

  if (inArchive) {
    return `
    <div class="triage-card triage-card--done" data-id="${item.id}">
      <div class="tc-header">
        <span class="tc-account-badge ${accountClass}">${accountLabel}</span>
        <span class="tc-date">${dateStr}</span>
      </div>
      <div class="tc-title">${escHtml(item.title)}</div>
      ${fromStr ? `<div class="tc-from">${escHtml(fromStr)}</div>` : ""}
      <div class="tc-actions">
        ${openBtn}
        <button class="tc-action-btn tc-undo-btn" data-id="${item.id}" title="Undo">↩ undo</button>
      </div>
    </div>`;
  }

  return `
  <div class="triage-card" draggable="true" data-id="${item.id}" data-type="${item.type}" data-account="${item.account}">
    <div class="tc-header">
      <span class="tc-account-badge ${accountClass}">${accountLabel}</span>
      <span class="tc-date">${dateStr}</span>
    </div>
    <div class="tc-title">${escHtml(item.title)}</div>
    ${fromStr ? `<div class="tc-from">${escHtml(fromStr)}</div>` : ""}
    ${item.snippet ? `<div class="tc-snippet">${escHtml(item.snippet.slice(0, 80))}${item.snippet.length > 80 ? "…" : ""}</div>` : ""}
    <div class="tc-actions">
      ${openBtn}
      <button class="tc-action-btn tc-done-btn" data-id="${item.id}" title="Complete">✓ done</button>
      <button class="tc-action-btn tc-abort-btn" data-id="${item.id}" title="Ignore">✗ ignore</button>
    </div>
  </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render a column ────────────────────────────────────────────────────────
const LANE_META = {
  stat:    { label: "🔴 STAT",    cls: "lane-stat" },
  asap:    { label: "🟡 ASAP",    cls: "lane-asap" },
  routine: { label: "🟢 Routine", cls: "lane-routine" },
};

function renderColumn(lane, items) {
  const { label, cls } = LANE_META[lane];
  return `
  <div class="triage-col ${cls}" data-lane="${lane}">
    <div class="tc-col-header">
      <span>${label}</span>
      <span class="tc-count">${items.length}</span>
    </div>
    <div class="tc-col-body" data-drop-zone="${lane}">
      ${items.length === 0
        ? `<div class="tc-empty">—</div>`
        : items.map(it => renderCard(it)).join("")}
    </div>
  </div>`;
}

// ── Render archive (Done / Aborted) ───────────────────────────────────────
function renderArchive(items, allData) {
  const doneItems    = items.filter(it => LS.get(LS.doneKey(it.id)));
  const abortedItems = items.filter(it => LS.get(LS.abortedKey(it.id)));

  return `
  <div class="triage-archive-row">
    <div class="triage-archive-col triage-done-col">
      <button class="tc-archive-header" data-archive="done">
        <span class="tc-archive-chevron">▶</span> Completed <span class="tc-count">${doneItems.length}</span>
      </button>
      <div class="tc-archive-body" id="archive-done" hidden>
        ${doneItems.length === 0
          ? `<div class="tc-empty">Nothing here yet.</div>`
          : doneItems.map(it => renderCard(it, true)).join("")}
      </div>
    </div>
    <div class="triage-archive-col triage-aborted-col">
      <button class="tc-archive-header" data-archive="aborted">
        <span class="tc-archive-chevron">▶</span> Aborted <span class="tc-count">${abortedItems.length}</span>
      </button>
      <div class="tc-archive-body" id="archive-aborted" hidden>
        ${abortedItems.length === 0
          ? `<div class="tc-empty">Nothing here yet.</div>`
          : abortedItems.map(it => renderCard(it, true)).join("")}
      </div>
    </div>
  </div>`;
}

// ── Full render ────────────────────────────────────────────────────────────
export function renderTriageKanban({ items, gmailAvailable, researchAvailable }, container) {
  let activeFilter = "all";
  let triageData = { items, gmailAvailable, researchAvailable };

  function getDisplayItems() {
    return items.filter(it => {
      if (LS.get(LS.doneKey(it.id)) || LS.get(LS.abortedKey(it.id))) return false;
      if (activeFilter === "personal")  return it.account === "personal";
      if (activeFilter === "research")  return it.account === "research";
      if (activeFilter === "tasks")     return it.account === "notion";
      return true;
    });
  }

  function getColumnItems(displayItems, lane) {
    return displayItems.filter(it => effectivePriority(it) === lane);
  }

  function buildBoard() {
    const display = getDisplayItems();
    const stat    = getColumnItems(display, "stat");
    const asap    = getColumnItems(display, "asap");
    const routine = getColumnItems(display, "routine");
    const totalActive = stat.length + asap.length + routine.length;

    const noGmail = !gmailAvailable
      ? `<div class="tc-setup-note">Gmail not connected — <a href="#" id="tc-setup-link">setup instructions</a></div>`
      : "";

    container.innerHTML = `
      <div class="triage-toolbar">
        <span class="card-label">triage <span class="count-badge">${totalActive}</span></span>
        <div class="tc-filters">
          <button class="mood-chip tc-filter ${activeFilter === "all"      ? "selected" : ""}" data-filter="all">all</button>
          <button class="mood-chip tc-filter ${activeFilter === "personal" ? "selected" : ""}" data-filter="personal">personal</button>
          ${researchAvailable ? `<button class="mood-chip tc-filter ${activeFilter === "research" ? "selected" : ""}" data-filter="research">research</button>` : ""}
          <button class="mood-chip tc-filter ${activeFilter === "tasks"    ? "selected" : ""}" data-filter="tasks">tasks</button>
        </div>
        <button class="triage-refresh-btn" id="triage-refresh-btn" title="Refresh">↻</button>
      </div>
      ${noGmail}
      <div class="triage-board-scroll">
        <div class="triage-board">
          ${renderColumn("stat",    stat)}
          ${renderColumn("asap",    asap)}
          ${renderColumn("routine", routine)}
        </div>
      </div>
      ${renderArchive(items, triageData)}
    `;

    wireEvents();
  }

  // ── Wire all events ──────────────────────────────────────────────────────
  function wireEvents() {
    // Filter chips
    container.querySelectorAll(".tc-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.filter;
        buildBoard();
      });
    });

    // Refresh
    container.querySelector("#triage-refresh-btn")?.addEventListener("click", async () => {
      const btn = container.querySelector("#triage-refresh-btn");
      btn.classList.add("spinning");
      const fresh = await loadTriage();
      triageData = fresh;
      items = fresh.items;
      gmailAvailable = fresh.gmailAvailable;
      researchAvailable = fresh.researchAvailable;
      buildBoard();
    });

    // Setup link
    container.querySelector("#tc-setup-link")?.addEventListener("click", e => {
      e.preventDefault();
      alert(
        "Gmail setup:\n\n" +
        "1. Go to Google Cloud Console → enable Gmail API\n" +
        "2. Create OAuth 2.0 Desktop credentials\n" +
        "3. Run the helper script: node scripts/gmail-auth.js\n" +
        "4. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN to Vercel env vars"
      );
    });

    // Done buttons
    container.querySelectorAll(".tc-done-btn").forEach(btn => {
      btn.addEventListener("click", () => handleComplete(btn.dataset.id));
    });

    // Abort buttons
    container.querySelectorAll(".tc-abort-btn").forEach(btn => {
      btn.addEventListener("click", () => handleAbort(btn.dataset.id));
    });

    // Undo buttons (in archive sections)
    container.querySelectorAll(".tc-undo-btn").forEach(btn => {
      btn.addEventListener("click", () => handleUndo(btn.dataset.id));
    });

    // Archive toggles
    container.querySelectorAll(".tc-archive-header").forEach(btn => {
      btn.addEventListener("click", () => {
        const archive = btn.dataset.archive;
        const body = container.querySelector(`#archive-${archive}`);
        const chevron = btn.querySelector(".tc-archive-chevron");
        if (!body) return;
        const isHidden = body.hidden;
        body.hidden = !isHidden;
        if (chevron) chevron.textContent = isHidden ? "▼" : "▶";
      });
    });

    // Drag-and-drop
    wireDragDrop();
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  function findItem(id) { return items.find(it => it.id === id); }

  function handleComplete(id) {
    const item = findItem(id);
    if (!item) return;
    const prev = effectivePriority(item);
    LS.set(LS.doneKey(id), { prev });
    LS.del(LS.abortedKey(id));
    buildBoard();
    // Fire API async
    mailAction("mark_read", item);
    mailAction("unstar", item);
    notionComplete(item, false);
    showUndoChip(id, "done");
  }

  function handleAbort(id) {
    const item = findItem(id);
    if (!item) return;
    const prev = effectivePriority(item);
    LS.set(LS.abortedKey(id), { prev });
    LS.del(LS.doneKey(id));
    buildBoard();
    // Mark read (suppress notification), no Notion status change
    mailAction("mark_read", item);
    showUndoChip(id, "aborted");
  }

  function handleUndo(id) {
    const item = findItem(id);
    const doneState    = LS.get(LS.doneKey(id));
    const abortedState = LS.get(LS.abortedKey(id));
    const state = doneState || abortedState;
    if (!state) return;
    const wasDone = !!doneState;
    LS.del(LS.doneKey(id));
    LS.del(LS.abortedKey(id));
    // Restore priority
    if (state.prev) LS.set(LS.priorityKey(id), state.prev);
    buildBoard();
    // Reverse API changes
    if (wasDone && item) {
      mailAction("mark_unread", item);
      mailAction("restar", item);
      notionComplete(item, true);
    } else if (item) {
      mailAction("mark_unread", item);
    }
  }

  // ── Undo chip ─────────────────────────────────────────────────────────────
  function showUndoChip(id, type) {
    const existing = document.querySelector(".tc-undo-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "tc-undo-toast";
    toast.innerHTML = `
      ${type === "done" ? "Marked complete." : "Ignored."}
      <button class="tc-undo-toast-btn">Undo</button>
    `;
    toast.querySelector(".tc-undo-toast-btn").addEventListener("click", () => {
      handleUndo(id);
      toast.remove();
      clearTimeout(timer);
    });
    document.body.appendChild(toast);
    const timer = setTimeout(() => toast.remove(), 6000);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  let dragId = null;

  function wireDragDrop() {
    container.querySelectorAll(".triage-card[draggable]").forEach(card => {
      card.addEventListener("dragstart", e => {
        dragId = card.dataset.id;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        dragId = null;
      });
    });

    container.querySelectorAll("[data-drop-zone]").forEach(zone => {
      zone.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        zone.classList.add("drop-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("drop-over"));
      zone.addEventListener("drop", e => {
        e.preventDefault();
        zone.classList.remove("drop-over");
        if (!dragId) return;
        const newLane = zone.dataset.dropZone;
        const item = findItem(dragId);
        if (!item) return;
        const oldPriority = effectivePriority(item);
        if (oldPriority === newLane) return;
        LS.set(LS.priorityKey(dragId), newLane);
        buildBoard();
        notionSetPriority(item, newLane);
      });
    });
  }

  // Initial render
  buildBoard();
}
