import { api, IDS, prop, pageTitle, nlink, fmtRelative } from "./data.js";
import { openPage } from "./viewer.js";

// ── PSYCHIATRY DB ─────────────────────────────────────────────────────────────
const PSYCH_CATEGORIES = ["assessment", "management", "disorders", "tips and pearls"];

const PSYCH_COLORS = {
  "assessment":     { bg: "#f3f0ff", border: "#9b8fef", text: "#5a4fcf" },
  "management":     { bg: "#eef4ff", border: "#7aacf5", text: "#2563c0" },
  "disorders":      { bg: "#eefbf4", border: "#6ecba0", text: "#1a7a4a" },
  "tips and pearls":{ bg: "#fff8ee", border: "#f5c56a", text: "#a06a10" },
};

// ── PSYCHOPHARM DB ────────────────────────────────────────────────────────────
const PHARM_SETTINGS = ["emergency", "acute inpatient", "general"];

const PHARM_COLORS = {
  "emergency":      { bg: "#fff0f3", border: "#f5839a", text: "#b3264a" },
  "acute inpatient":{ bg: "#f3f0ff", border: "#9b8fef", text: "#5a4fcf" },
  "general":        { bg: "#eefbf4", border: "#6ecba0", text: "#1a7a4a" },
};

// Entries edited within 48h are flagged as recent
const RECENT_MS = 48 * 60 * 60 * 1000;
function isRecent(lastEdited) {
  return lastEdited && (Date.now() - new Date(lastEdited).getTime()) < RECENT_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────
export async function loadPsychiatryMatrix() {
  const [dbData, flashData, pharmData] = await Promise.all([
    api("query", IDS.psychiatryDb, {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    }),
    api("query", IDS.flashcards, {
      filter: { property: "ask", formula: { checkbox: { equals: true } } },
      page_size: 100,
    }),
    api("query", IDS.psychopharmDb, {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    }),
  ]);

  const psychEntries = (dbData.results || []).map(page => ({
    id: page.id,
    title: pageTitle(page),
    category: (prop(page, "Category") || "").toLowerCase(),
    subcategory: prop(page, "Subcategory") || "",
    lastEdited: page.last_edited_time,
    recent: isRecent(page.last_edited_time),
  }));

  const pharmEntries = (pharmData.results || []).map(page => ({
    id: page.id,
    title: pageTitle(page),
    setting: (prop(page, "setting") || "general").toLowerCase(),
    type: prop(page, "type") || "",
    knowledgeOn: prop(page, "knowledge on") || [],
    lastEdited: page.last_edited_time,
    recent: isRecent(page.last_edited_time),
  }));

  const dueCards = flashData.results?.length || 0;
  const subjectBreakdown = {};
  (flashData.results || []).forEach(card => {
    const s = prop(card, "subject") || "other";
    subjectBreakdown[s] = (subjectBreakdown[s] || 0) + 1;
  });

  return { psychEntries, pharmEntries, dueCards, subjectBreakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER — tab switcher containing both matrices
// ─────────────────────────────────────────────────────────────────────────────
export function renderPsychiatryMatrix(data, container) {
  const { psychEntries, pharmEntries, dueCards, subjectBreakdown } = data;

  container.innerHTML = `
    <!-- Tab bar + search -->
    <div class="kb-tabs">
      <button class="kb-tab active" data-tab="psych">🧠 psychiatry</button>
      <button class="kb-tab" data-tab="pharm">💊 psychopharm</button>
      <div class="kb-tab-spacer"></div>
      <input class="kb-search" id="kb-search" type="text" placeholder="search…" autocomplete="off"/>
      <a class="see-all" id="kb-notion-link" href="${nlink(IDS.psychiatryPage)}" target="_blank">open in notion ↗</a>
    </div>

    <!-- Psychiatry panel -->
    <div class="kb-panel" id="kb-panel-psych">
      <div class="psych-matrix" id="psych-matrix-grid">
        ${PSYCH_CATEGORIES.map(cat => psychColumn(cat, psychEntries.filter(e => e.category === cat))).join("")}
      </div>
      ${flashcardStrip(dueCards, subjectBreakdown)}
    </div>

    <!-- Psychopharm panel (hidden initially) -->
    <div class="kb-panel" id="kb-panel-pharm" style="display:none;">
      <div class="psych-matrix pharm-matrix" id="pharm-matrix-grid">
        ${PHARM_SETTINGS.map(s => pharmColumn(s, pharmEntries.filter(e => e.setting === s))).join("")}
      </div>
    </div>
  `;

  // Wire up tabs
  container.querySelectorAll(".kb-tab[data-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".kb-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      document.getElementById("kb-panel-psych").style.display = which === "psych" ? "" : "none";
      document.getElementById("kb-panel-pharm").style.display = which === "pharm" ? "" : "none";
      document.getElementById("kb-notion-link").href =
        which === "psych" ? nlink(IDS.psychiatryPage) : nlink(IDS.psychopharmPage);
      // Clear search on tab switch
      const searchEl = document.getElementById("kb-search");
      if (searchEl) { searchEl.value = ""; filterEntries(""); }
    });
  });

  // Wire up search
  const searchEl = document.getElementById("kb-search");
  if (searchEl) {
    searchEl.addEventListener("input", () => filterEntries(searchEl.value.trim().toLowerCase()));
  }

  // Wire up click handlers for all entry rows
  container.querySelectorAll("[data-page-id]").forEach(el => {
    el.addEventListener("click", () => openPage(el.dataset.pageId, el.dataset.pageTitle));
  });
}

// Filter matrix entries by search term
function filterEntries(q) {
  document.querySelectorAll(".matrix-entry").forEach(el => {
    const title = (el.dataset.pageTitle || "").toLowerCase();
    el.style.display = (!q || title.includes(q)) ? "" : "none";
  });
  // Hide columns that have no visible entries (show if header still relevant)
  document.querySelectorAll(".matrix-col").forEach(col => {
    const visible = [...col.querySelectorAll(".matrix-entry")].some(e => e.style.display !== "none");
    col.style.display = visible ? "" : (q ? "none" : "");
  });
}

// ── PSYCHIATRY MATRIX COLUMN ──────────────────────────────────────────────────
function psychColumn(cat, entries) {
  const colors = PSYCH_COLORS[cat] || PSYCH_COLORS["assessment"];

  const bySubcat = {};
  entries.forEach(e => {
    const sub = e.subcategory || "_none";
    if (!bySubcat[sub]) bySubcat[sub] = [];
    bySubcat[sub].push(e);
  });

  let rowsHtml = "";
  if (bySubcat["_none"]?.length) {
    rowsHtml += bySubcat["_none"].map(e => entryRow(e, colors)).join("");
    delete bySubcat["_none"];
  }
  Object.entries(bySubcat).forEach(([sub, subEntries]) => {
    rowsHtml += `<div class="matrix-subcat-label">${sub}</div>`;
    rowsHtml += subEntries.map(e => entryRow(e, colors)).join("");
  });

  return matrixCol(cat, entries.length, colors, rowsHtml);
}

// ── PSYCHOPHARM MATRIX COLUMN ────────────────────────────────────────────────
function pharmColumn(setting, entries) {
  const colors = PHARM_COLORS[setting] || PHARM_COLORS["general"];

  const byType = {};
  entries.forEach(e => {
    const t = e.type || "_none";
    if (!byType[t]) byType[t] = [];
    byType[t].push(e);
  });

  let rowsHtml = "";
  if (byType["_none"]?.length) {
    rowsHtml += byType["_none"].map(e => pharmEntryRow(e, colors)).join("");
    delete byType["_none"];
  }
  Object.entries(byType).forEach(([type, typeEntries]) => {
    rowsHtml += `<div class="matrix-subcat-label">${type}</div>`;
    rowsHtml += typeEntries.map(e => pharmEntryRow(e, colors)).join("");
  });

  return matrixCol(setting, entries.length, colors, rowsHtml);
}

// ── SHARED COLUMN TEMPLATE ───────────────────────────────────────────────────
function matrixCol(label, count, colors, rowsHtml) {
  return `
    <div class="matrix-col">
      <div class="matrix-col-header"
           style="background:${colors.bg}; border-color:${colors.border}; color:${colors.text};">
        ${label}
        <span class="matrix-col-count">${count}</span>
      </div>
      <div class="matrix-col-body">
        ${rowsHtml || `<div class="matrix-empty">—</div>`}
      </div>
    </div>`;
}

function entryRow(e, colors) {
  return `
    <div class="matrix-entry${e.recent ? " recently-updated" : ""}"
         data-page-id="${e.id}" data-page-title="${e.title}"
         title="Click to read · ${fmtRelative(e.lastEdited)}">
      <span class="matrix-entry-dot" style="background:${colors.border};"></span>
      <span class="matrix-entry-title">${e.title}</span>
      ${e.recent ? `<span class="recent-badge" title="Updated ${fmtRelative(e.lastEdited)}">new</span>` : `<span class="matrix-entry-time">${fmtRelative(e.lastEdited)}</span>`}
    </div>`;
}

function pharmEntryRow(e, colors) {
  const tags = (e.knowledgeOn || []).map(k =>
    `<span class="pharm-tag">${k}</span>`
  ).join("");
  return `
    <div class="matrix-entry${e.recent ? " recently-updated" : ""}"
         data-page-id="${e.id}" data-page-title="${e.title}"
         title="Click to read · ${fmtRelative(e.lastEdited)}">
      <span class="matrix-entry-dot" style="background:${colors.border};"></span>
      <span class="matrix-entry-title">${e.title}</span>
      <span class="pharm-tags">${tags}</span>
      ${e.recent ? `<span class="recent-badge" title="Updated ${fmtRelative(e.lastEdited)}">new</span>` : `<span class="matrix-entry-time">${fmtRelative(e.lastEdited)}</span>`}
    </div>`;
}

// ── FLASHCARD STRIP (psychiatry panel only) ──────────────────────────────────
function flashcardStrip(dueCards, subjectBreakdown) {
  return `
    <div class="psych-flashcard-strip">
      <div class="fc-strip-left">
        <span class="fc-due-num ${dueCards > 0 ? "has-due" : ""}">${dueCards}</span>
        <span class="fc-due-label">cards due today</span>
        ${Object.keys(subjectBreakdown).length > 0
          ? `<div class="fc-subjects">
              ${Object.entries(subjectBreakdown).slice(0, 6).map(([s, n]) =>
                `<span class="fc-subj-pill">${s} <b>${n}</b></span>`
              ).join("")}
            </div>`
          : ""}
      </div>
      <div class="fc-strip-right">
        <a class="fc-btn fc-primary"
           href="https://www.notion.so/27cf6c38f95e80f5b8d4f8d2652f0882?v=27cf6c38f95e80b9a5fc000c756756a2"
           target="_blank">quiz mode ↗</a>
        <a class="fc-btn"
           href="https://www.notion.so/27cf6c38f95e80f5b8d4f8d2652f0882?v=27cf6c38f95e80a0b535000c7d601f98"
           target="_blank">edit cards ↗</a>
        <a class="fc-btn" href="${nlink(IDS.flashcardTemplate)}" target="_blank">+ new card ↗</a>
      </div>
    </div>`;
}
