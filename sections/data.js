// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// After deploying to Vercel, replace this URL with your actual deployment URL.
// During local development with `vercel dev`, the default below works as-is.
// ─────────────────────────────────────────────────────────────────────────────
export const PROXY =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api/notion"
    : "https://yoonjae-hub.vercel.app"; // ← update after Vercel deploy

// ─────────────────────────────────────────────────────────────────────────────
// ALL NOTION DATABASE / PAGE IDs FROM YOUR WORKSPACE
// ─────────────────────────────────────────────────────────────────────────────
export const IDS = {
  // Databases
  weeklySchedule:    "31ef6c38-f95e-80ca-99d4-ebe96b90348f",
  taskBoard:         "31ef6c38-f95e-80a5-ab02-c4eeaa44177f",
  waveTracker:       "31ef6c38-f95e-8098-ab39-ff0d9a5327be",
  researchPipeline:  "31ef6c38-f95e-8060-b59c-ed57d63ab7a3",
  uworldTracker:     "31ef6c38-f95e-80e8-9c55-ed4e894ade06",
  petCareLog:        "31ef6c38-f95e-80cc-989d-e7351902c917",
  psychiatryDb:      "9597dfe9-a7a6-42e1-8989-c0ff7ed16250",
  flashcards:        "27cf6c38-f95e-80f5-b8d4-f8d2652f0882",
  flashcardTemplate: "27df6c38-f95e-81cb-bb86-d381d22b642e",
  // Pages
  psychiatryPage:    "294f6c38-f95e-804a-b2cc-d86f0276298f",
  commandCenter:     "31ef6c38-f95e-8088-b194-c29b9ceaad09",
  prite:             "32af6c38-f95e-80c1-a848-d6f38c2673b8",
  step3Review:       "25cf6c38-f95e-8068-b0c5-f9949d987df6",
};

// Notion web URL base — for "open in Notion" links
export const N = "https://www.notion.so/";
export function nlink(id) { return N + id.replace(/-/g, ""); }

// ─────────────────────────────────────────────────────────────────────────────
// PROXY FETCH — all calls go through the Vercel function
// ─────────────────────────────────────────────────────────────────────────────
export async function api(op, id, body) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, id, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY EXTRACTORS — safely pull typed values from a Notion page object
// ─────────────────────────────────────────────────────────────────────────────
export function prop(page, name) {
  const p = page?.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case "title":        return p.title?.map(t => t.plain_text).join("") || "";
    case "rich_text":    return p.rich_text?.map(t => t.plain_text).join("") || "";
    case "select":       return p.select?.name ?? null;
    case "multi_select": return p.multi_select?.map(s => s.name) ?? [];
    case "status":       return p.status?.name ?? null;
    case "checkbox":     return p.checkbox;
    case "date":         return p.date?.start ?? null;
    case "number":       return p.number;
    case "url":          return p.url;
    case "created_time": return p.created_time;
    case "last_edited_time": return p.last_edited_time;
    case "formula":
      const f = p.formula;
      return f?.boolean ?? f?.string ?? f?.number ?? null;
    default: return null;
  }
}

export function pageTitle(page) {
  if (!page?.properties) return "Untitled";
  const tp = Object.values(page.properties).find(p => p.type === "title");
  return tp?.title?.map(t => t.plain_text).join("") || "Untitled";
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date(todayStr())) / 86400000);
}

export function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtRelative(d) {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)  return `${days}d ago`;
  return fmtDate(d);
}
