import { api, IDS, prop, pageTitle, nlink, fmtRelative } from "./data.js";
import { openPage } from "./viewer.js";

// The columns of the matrix — these are the Category values in your psychiatry db
const CATEGORIES = ["assessment", "management", "disorders", "tips and pearls", "exams"];

// Color palette matching Notion's category colors
const CAT_COLORS = {
  "assessment":    { bg: "#f3f0ff", border: "#9b8fef", text: "#5a4fcf" },
  "management":    { bg: "#eef4ff", border: "#7aacf5", text: "#2563c0" },
  "disorders":     { bg: "#eefbf4", border: "#6ecba0", text: "#1a7a4a" },
  "tips and pearls":{ bg: "#fff8ee", border: "#f5c56a", text: "#a06a10" },
  "exams":         { bg: "#fff0f3", border: "#f5839a", text: "#b3264a" },
};

const SUBCAT_LABELS = {
  "primary":        "primary",
  "secondary":      "secondary",
  "medication":     "medication",
  "maintenance":    "maintenance",
  "psychotherapy":  "psychotherapy",
  "interview":      "interview",
  "SI/HI/AVH":      "SI/HI/AVH",
  "recognizing sx": "recognizing sx",
};

export async function loadPsychiatryMatrix() {
  // Load all psychiatry db entries + flashcard due count in parallel
  const [dbData, flashData] = await Promise.all([
    api("query", IDS.psychiatryDb, {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    }),
    api("query", IDS.flashcards, {
      filter: { property: "ask", formula: { checkbox: { equals: true } } },
      page_size: 100,
    }),
  ]);

  const entries = (dbData.results || []).map(page => ({
    id: page.id,
    title: pageTitle(page),
    category: prop(page, "Category") || "",
    subcategory: prop(page, "Subcategory") || "",
    lastEdited: page.last_edited_time,
    url: nlink(page.id),
  }));

  const dueCards = flashData.results?.length || 0;
  const subjectBreakdown = {};
  (flashData.results || []).forEach(card => {
    const s = prop(card, "subject") || "other";
    subjectBreakdown[s] = (subjectBreakdown[s] || 0) + 1;
  });

  return { entries, dueCards, subjectBreakdown };
}

export function renderPsychiatryMatrix({ entries, dueCards, subjectBreakdown }, container) {
  // Group entries by category
  const byCategory = {};
  CATEGORIES.forEach(cat => { byCategory[cat] = []; });
  entries.forEach(e => {
    const cat = e.category.toLowerCase();
    if (byCategory[cat]) byCategory[cat].push(e);
    else {
      // Unknown category — add to closest or skip
    }
  });

  container.innerHTML = `
    <div class="psych-section-header">
      <div class="section-title-row">
        <div class="card-label">🧠 psychiatry · knowledge hub</div>
        <div class="psych-header-actions">
          <a class="see-all" href="${nlink(IDS.psychiatryPage)}" target="_blank">open in notion ↗</a>
        </div>
      </div>
    </div>

    <!-- Matrix: one column per Category, entries listed within each -->
    <div class="psych-matrix">
      ${CATEGORIES.map(cat => matrixColumn(cat, byCategory[cat] || [])).join("")}
    </div>

    <!-- Flashcard strip below the matrix -->
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
        <a class="fc-btn" href="${nlink(IDS.prite)}" target="_blank">PRITE ↗</a>
      </div>
    </div>
  `;

  // Wire up click handlers for every entry row
  container.querySelectorAll("[data-page-id]").forEach(el => {
    el.addEventListener("click", () => {
      openPage(el.dataset.pageId, el.dataset.pageTitle);
    });
  });
}

function matrixColumn(cat, entries) {
  const colors = CAT_COLORS[cat] || CAT_COLORS["assessment"];

  // Group entries by subcategory within this column
  const bySubcat = {};
  entries.forEach(e => {
    const sub = e.subcategory || "_none";
    if (!bySubcat[sub]) bySubcat[sub] = [];
    bySubcat[sub].push(e);
  });

  // Build row list — entries without a subcategory come first, then grouped
  let rowsHtml = "";

  // Entries with no subcategory
  if (bySubcat["_none"]?.length) {
    rowsHtml += bySubcat["_none"].map(e => entryRow(e, colors)).join("");
    delete bySubcat["_none"];
  }

  // Grouped subcategory entries
  Object.entries(bySubcat).forEach(([sub, subEntries]) => {
    rowsHtml += `<div class="matrix-subcat-label">${SUBCAT_LABELS[sub] || sub}</div>`;
    rowsHtml += subEntries.map(e => entryRow(e, colors)).join("");
  });

  return `
    <div class="matrix-col">
      <div class="matrix-col-header" style="background:${colors.bg}; border-color:${colors.border}; color:${colors.text};">
        ${cat}
        <span class="matrix-col-count">${entries.length}</span>
      </div>
      <div class="matrix-col-body">
        ${rowsHtml || `<div class="matrix-empty">—</div>`}
      </div>
    </div>
  `;
}

function entryRow(e, colors) {
  return `
    <div class="matrix-entry" data-page-id="${e.id}" data-page-title="${e.title}"
         title="Click to read · ${fmtRelative(e.lastEdited)}">
      <span class="matrix-entry-dot" style="background:${colors.border};"></span>
      <span class="matrix-entry-title">${e.title}</span>
      <span class="matrix-entry-time">${fmtRelative(e.lastEdited)}</span>
    </div>
  `;
}
