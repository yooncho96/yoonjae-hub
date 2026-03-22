import { api, nlink, prop, pageTitle, fmtDate } from "./data.js";
import { renderBlocksInto } from "./renderer.js";

// ─────────────────────────────────────────────────────────────────────────────
// PAGE VIEWER
// A slide-in panel that loads a Notion page's full content inline.
// The panel is created once and reused for every page open.
// ─────────────────────────────────────────────────────────────────────────────

let panel, overlay, titleEl, metaEl, bodyEl, notionLinkEl;

export function initViewer() {
  // Create overlay
  overlay = document.createElement("div");
  overlay.className = "viewer-overlay";
  overlay.addEventListener("click", closeViewer);

  // Create panel
  panel = document.createElement("div");
  panel.className = "viewer-panel";
  panel.innerHTML = `
    <div class="viewer-header">
      <div class="viewer-header-left">
        <h2 class="viewer-title" id="viewer-title">Loading…</h2>
        <div class="viewer-meta" id="viewer-meta"></div>
      </div>
      <div class="viewer-header-right">
        <a class="viewer-notion-link" id="viewer-notion-link" target="_blank">Open in Notion ↗</a>
        <button class="viewer-close" id="viewer-close" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="viewer-body" id="viewer-body">
      <div class="viewer-loading">
        <div class="viewer-spinner"></div>
        <span>Loading page…</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  titleEl      = document.getElementById("viewer-title");
  metaEl       = document.getElementById("viewer-meta");
  bodyEl       = document.getElementById("viewer-body");
  notionLinkEl = document.getElementById("viewer-notion-link");
  document.getElementById("viewer-close").addEventListener("click", closeViewer);

  // Close on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeViewer();
  });
}

export async function openPage(pageId, titleHint = "") {
  // Show panel immediately with skeleton state
  titleEl.textContent = titleHint || "Loading…";
  metaEl.textContent = "";
  notionLinkEl.href = nlink(pageId);
  bodyEl.innerHTML = `<div class="viewer-loading"><div class="viewer-spinner"></div><span>Fetching page…</span></div>`;

  overlay.classList.add("active");
  panel.classList.add("active");
  document.body.style.overflow = "hidden";

  try {
    // Fetch page metadata and blocks in parallel
    const [pageMeta, blocksData] = await Promise.all([
      api("page", pageId),
      api("blocks", pageId),
    ]);

    // Update header with real title and metadata
    const title = pageTitle(pageMeta);
    titleEl.textContent = title;

    // Build a concise metadata line from page properties
    const meta = buildMeta(pageMeta);
    metaEl.innerHTML = meta;

    // Render the blocks into the body
    bodyEl.innerHTML = "";
    await renderBlocksInto(blocksData.results || [], bodyEl);

  } catch (err) {
    bodyEl.innerHTML = `
      <div class="viewer-error">
        <p>Could not load this page.</p>
        <p class="viewer-error-detail">${err.message}</p>
        <a href="${nlink(pageId)}" target="_blank" class="btn-outline">Open in Notion ↗</a>
      </div>`;
  }
}

export function closeViewer() {
  overlay.classList.remove("active");
  panel.classList.remove("active");
  document.body.style.overflow = "";
}

// Build a concise metadata line from whichever properties exist
function buildMeta(page) {
  const parts = [];
  const ps = page.properties || {};

  const cat    = ps.Category?.select?.name;
  const subcat = ps.Subcategory?.select?.name;
  const status = ps.Status?.status?.name;
  const modTime = ps["Last Modified"]?.last_edited_time || page.last_edited_time;

  if (cat)     parts.push(`<span class="meta-chip meta-cat">${cat}</span>`);
  if (subcat)  parts.push(`<span class="meta-chip meta-sub">${subcat}</span>`);
  if (status)  parts.push(`<span class="meta-chip meta-status">${status}</span>`);
  if (modTime) parts.push(`<span class="meta-date">edited ${fmtDate(modTime)}</span>`);

  return parts.join(" ");
}
