// ─────────────────────────────────────────────────────────────────────────────
// NOTION BLOCK → HTML RENDERER
//
// Notion pages are made of "blocks" — each block has a type (paragraph,
// heading_1, bulleted_list_item, toggle, callout, etc.) and rich_text content.
// Rich text itself can have annotations (bold, italic, color, strikethrough)
// and optional inline links or mentions.
//
// This renderer handles the block types you actually use in your notes.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "./data.js";

// ── RICH TEXT RENDERING ───────────────────────────────────────────────────────
// Each rich_text item has:  plain_text, annotations{bold,italic,code,color...}, href
function renderRichText(rtArr) {
  if (!rtArr?.length) return "";
  return rtArr.map(rt => {
    let text = escHtml(rt.plain_text);
    const a = rt.annotations || {};

    // Apply inline formatting
    if (a.code)          text = `<code>${text}</code>`;
    if (a.bold)          text = `<strong>${text}</strong>`;
    if (a.italic)        text = `<em>${text}</em>`;
    if (a.strikethrough) text = `<s>${text}</s>`;
    if (a.underline)     text = `<u>${text}</u>`;

    // Notion color annotations — map to CSS classes
    if (a.color && a.color !== "default") {
      const colorClass = a.color.replace("_background", "-bg");
      text = `<span class="nc-${colorClass}">${text}</span>`;
    }

    // Inline links
    if (rt.href) {
      text = `<a href="${escAttr(rt.href)}" target="_blank" class="inline-link">${text}</a>`;
    }

    return text;
  }).join("");
}

// ── SINGLE BLOCK RENDERER ────────────────────────────────────────────────────
// Returns an HTML string for one block. Toggles and columns need async children
// so we return a placeholder and fill them in a second pass (renderBlocksAsync).
function renderBlock(block) {
  const rt = block[block.type]?.rich_text || [];
  const text = renderRichText(rt);

  switch (block.type) {
    case "paragraph":
      return text ? `<p class="nb-p">${text}</p>` : `<div class="nb-spacer"></div>`;

    case "heading_1":
      return `<h1 class="nb-h1">${text}</h1>`;
    case "heading_2":
      return `<h2 class="nb-h2">${text}</h2>`;
    case "heading_3":
      return `<h3 class="nb-h3">${text}</h3>`;

    case "bulleted_list_item":
      return `<li class="nb-li nb-bullet">${text}${childPlaceholder(block)}</li>`;
    case "numbered_list_item":
      return `<li class="nb-li nb-num">${text}${childPlaceholder(block)}</li>`;

    case "to_do":
      const checked = block.to_do?.checked;
      return `<div class="nb-todo">
        <span class="nb-checkbox ${checked ? "checked" : ""}"></span>
        <span class="${checked ? "nb-done" : ""}">${text}</span>
      </div>`;

    case "toggle":
      // Renders as a <details> element; children loaded lazily
      return `<details class="nb-toggle" data-block-id="${block.id}">
        <summary class="nb-toggle-summary">${text}</summary>
        <div class="nb-toggle-body" data-children-pending="${block.id}">
          <span class="nb-loading">loading…</span>
        </div>
      </details>`;

    case "callout":
      const icon = block.callout?.icon?.emoji || "💡";
      const color = block.callout?.color || "gray_background";
      const cls = "nb-callout nb-" + color.replace("_background", "-bg");
      return `<div class="${cls}">
        <span class="nb-callout-icon">${icon}</span>
        <div class="nb-callout-body">${text}${childPlaceholder(block)}</div>
      </div>`;

    case "quote":
      return `<blockquote class="nb-quote">${text}</blockquote>`;

    case "divider":
      return `<hr class="nb-hr">`;

    case "code":
      const lang = block.code?.language || "";
      const codeText = block.code?.rich_text?.map(r => r.plain_text).join("") || "";
      return `<pre class="nb-code" data-lang="${escAttr(lang)}"><code>${escHtml(codeText)}</code></pre>`;

    case "image":
      const imgUrl = block.image?.file?.url || block.image?.external?.url || "";
      const caption = renderRichText(block.image?.caption || []);
      return imgUrl
        ? `<figure class="nb-figure">
            <img src="${escAttr(imgUrl)}" class="nb-img" loading="lazy" alt="${caption || ""}">
            ${caption ? `<figcaption class="nb-caption">${caption}</figcaption>` : ""}
          </figure>`
        : "";

    case "column_list":
      // Columns need children — placeholder filled in async pass
      return `<div class="nb-columns" data-block-id="${block.id}" data-columns-pending="${block.id}">
        <span class="nb-loading">loading…</span>
      </div>`;

    case "column":
      return `<div class="nb-column" data-block-id="${block.id}">${childPlaceholder(block)}</div>`;

    case "table_of_contents":
      return `<div class="nb-toc-placeholder">Contents</div>`;

    case "child_page":
      const cpTitle = block.child_page?.title || "Subpage";
      return `<div class="nb-child-page">
        <span class="nb-child-page-icon">📄</span>
        <span>${escHtml(cpTitle)}</span>
      </div>`;

    case "child_database":
      return `<div class="nb-child-db">
        <span class="nb-child-page-icon">🗃</span>
        <span>${escHtml(block.child_database?.title || "Database")}</span>
      </div>`;

    case "equation":
      return `<span class="nb-equation">${escHtml(block.equation?.expression || "")}</span>`;

    default:
      // Unknown block type — render any text we can find
      return text ? `<p class="nb-p nb-unknown">${text}</p>` : "";
  }
}

// ── LIST WRAPPING ─────────────────────────────────────────────────────────────
// Notion sends list items as siblings without a wrapper. We need to group
// consecutive bulleted/numbered items into <ul>/<ol> tags.
function wrapLists(htmlString) {
  // Wrap consecutive <li class="nb-bullet"> in <ul>
  htmlString = htmlString.replace(
    /(<li class="nb-li nb-bullet">[\s\S]*?<\/li>\s*)+/g,
    match => `<ul class="nb-ul">${match}</ul>`
  );
  // Wrap consecutive <li class="nb-num"> in <ol>
  htmlString = htmlString.replace(
    /(<li class="nb-li nb-num">[\s\S]*?<\/li>\s*)+/g,
    match => `<ol class="nb-ol">${match}</ol>`
  );
  return htmlString;
}

// ── ASYNC BLOCK RENDERER ──────────────────────────────────────────────────────
// First renders all blocks synchronously, then makes a second pass to fill in
// toggle children and column children by fetching them from the API.
export async function renderBlocksInto(blocks, container) {
  // First pass: synchronous render
  let html = blocks.map(renderBlock).join("\n");
  html = wrapLists(html);
  container.innerHTML = html;

  // Second pass: find all pending children and fetch them
  const pending = container.querySelectorAll("[data-children-pending], [data-columns-pending]");
  const fetches = Array.from(pending).map(async el => {
    const blockId = el.dataset.childrenPending || el.dataset.columnsPending;
    try {
      const data = await api("block_children", blockId);
      const childBlocks = data.results || [];
      const isColumns = el.dataset.columnsPending != null;

      if (isColumns) {
        // Column list: fetch each column's children and render side by side
        el.innerHTML = "";
        const colFetches = childBlocks.map(async colBlock => {
          const colEl = document.createElement("div");
          colEl.className = "nb-column";
          const colChildren = await api("block_children", colBlock.id);
          await renderBlocksInto(colChildren.results || [], colEl);
          el.appendChild(colEl);
        });
        await Promise.all(colFetches);
      } else {
        // Toggle or callout children
        await renderBlocksInto(childBlocks, el);
      }
    } catch {
      el.innerHTML = `<span class="nb-err">failed to load</span>`;
    }
  });

  await Promise.allSettled(fetches);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function childPlaceholder(block) {
  // If a block has children, we add a nested placeholder.
  // The second async pass will populate it.
  return block.has_children
    ? `<div class="nb-children" data-children-pending="${block.id}"><span class="nb-loading">…</span></div>`
    : "";
}
