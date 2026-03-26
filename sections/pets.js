import { api, IDS, prop, pageTitle, fmtRelative, todayStr, nlink } from "./data.js";

// ─────────────────────────────────────────────────────────────────────────────
// PAGE MAPPERS
// ─────────────────────────────────────────────────────────────────────────────
function mapMimicPage(page) {
  return {
    id:        page.id,
    date:      prop(page, "date"),
    weight:    prop(page, "weight"),
    behavior:  prop(page, "behavior")        || [],
    schedMeds: prop(page, "scheduled meds")  || [],
    prnMeds:   prop(page, "PRN meds")        || [],
    training:  prop(page, "training")        || "",
    health:    prop(page, "health comments") || "",
  };
}

function mapPumpkinPage(page) {
  return {
    id:        page.id,
    date:      prop(page, "date"),
    weight:    prop(page, "weight"),
    hotTemp:   prop(page, "hot zone temp"),
    coolTemp:  prop(page, "cool zone temp"),
    hotHum:    prop(page, "hot zone humidity"),
    coolHum:   prop(page, "cool zone humidity"),
    feeding:   prop(page, "feeding"),
    shed:      prop(page, "shed"),
    husbandry: prop(page, "husbandry change") || "",
    health:    prop(page, "health comments")  || "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadPets() {
  const [mimicData, pumpkinData] = await Promise.all([
    api("query", IDS.mimic, {
      sorts: [{ property: "date", direction: "descending" }],
      page_size: 3,
    }),
    api("query", IDS.pumpkin, {
      sorts: [{ property: "date", direction: "descending" }],
      page_size: 3,
    }),
  ]);

  const lastMimic   = (mimicData.results   || [])[0] || null;
  const lastPumpkin = (pumpkinData.results || [])[0] || null;

  return {
    mimic:   lastMimic   ? mapMimicPage(lastMimic)     : null,
    pumpkin: lastPumpkin ? mapPumpkinPage(lastPumpkin)  : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PET HISTORY PANEL
// ─────────────────────────────────────────────────────────────────────────────
let histPanel, histOverlay, histTitleEl, histNotionLinkEl, histBodyEl;

function initPetHistory() {
  if (histPanel) return;

  histOverlay = document.createElement("div");
  histOverlay.className = "pet-history-overlay";
  histOverlay.addEventListener("click", closePetHistory);

  histPanel = document.createElement("div");
  histPanel.className = "pet-history-panel";
  histPanel.innerHTML = `
    <div class="pet-history-header">
      <h2 class="pet-history-title" id="pet-history-title">history</h2>
      <div class="pet-history-header-right">
        <a class="pet-history-notion-link" id="pet-history-notion-link" target="_blank">Open in Notion ↗</a>
        <button class="pet-history-close" id="pet-history-close" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="pet-history-body" id="pet-history-body">
      <div class="viewer-loading"><div class="viewer-spinner"></div><span>Loading…</span></div>
    </div>
  `;

  document.body.appendChild(histOverlay);
  document.body.appendChild(histPanel);

  histTitleEl      = document.getElementById("pet-history-title");
  histNotionLinkEl = document.getElementById("pet-history-notion-link");
  histBodyEl       = document.getElementById("pet-history-body");
  document.getElementById("pet-history-close").addEventListener("click", closePetHistory);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && histPanel.classList.contains("active")) closePetHistory();
  });
}

async function openPetHistory(dbId, petName, mapFn, summaryFn) {
  initPetHistory();

  histTitleEl.textContent = `${petName} · history`;
  histNotionLinkEl.href   = nlink(dbId);
  histBodyEl.innerHTML    = `<div class="viewer-loading"><div class="viewer-spinner"></div><span>Fetching records…</span></div>`;

  histOverlay.classList.add("active");
  histPanel.classList.add("active");
  document.body.style.overflow = "hidden";

  try {
    const data = await api("query", dbId, {
      sorts: [{ property: "date", direction: "descending" }],
      page_size: 50,
    });
    const entries = (data.results || []).map(mapFn);

    if (!entries.length) {
      histBodyEl.innerHTML = `<p class="pet-history-empty">No records found.</p>`;
      return;
    }

    histBodyEl.innerHTML = entries.map(entry => `
      <div class="pet-history-entry">
        <div class="pet-history-entry-top">
          <span class="pet-history-entry-date">${entry.date || "no date"}</span>
          <a class="pet-history-entry-link" href="${nlink(entry.id)}" target="_blank">open ↗</a>
        </div>
        ${summaryFn(entry)}
      </div>
    `).join("");
  } catch (err) {
    histBodyEl.innerHTML = `<p class="pet-history-empty">Failed to load: ${err.message}</p>`;
  }
}

function closePetHistory() {
  if (!histPanel) return;
  histOverlay.classList.remove("active");
  histPanel.classList.remove("active");
  document.body.style.overflow = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST-ENTRY SUMMARY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function pill(text, style = "") {
  return `<span class="pet-summary-pill${style ? " " + style : ""}">${text}</span>`;
}

function first8(text) {
  const words = text.trim().split(/\s+/);
  return words.length <= 8 ? text : words.slice(0, 8).join(" ") + "…";
}

function mimicSummary(m) {
  const parts = [];
  if (m.weight)             parts.push(pill(`${m.weight} lbs`, "pet-pill-neutral"));
  m.behavior.forEach(b =>   parts.push(pill(b)));
  m.schedMeds.forEach(s =>  parts.push(pill(s, "pet-pill-med")));
  m.prnMeds.forEach(p =>    parts.push(pill(p, "pet-pill-prn")));
  if (m.training)           parts.push(pill(`training: ${first8(m.training)}`, "pet-pill-note"));
  if (m.health)             parts.push(pill(`⚕ ${first8(m.health)}`, "pet-pill-health"));
  return parts.length
    ? `<div class="pet-summary-pills">${parts.join("")}</div>`
    : `<div class="pet-last-log">no details</div>`;
}

function pumpkinSummary(p) {
  const parts = [];
  if (p.weight !== null && p.weight !== undefined) parts.push(pill(`${p.weight}g`, "pet-pill-neutral"));
  if (p.feeding)  parts.push(pill(`feeding: ${p.feeding}`, p.feeding === "success" ? "pet-pill-good" : "pet-pill-warn"));
  if (p.shed)     parts.push(pill(`shed: ${p.shed}`, p.shed === "success" ? "pet-pill-good" : "pet-pill-warn"));
  if (p.hotTemp !== null && p.hotTemp !== undefined)  parts.push(pill(`hot ${p.hotTemp}°F`, "pet-pill-neutral"));
  if (p.coolTemp !== null && p.coolTemp !== undefined) parts.push(pill(`cool ${p.coolTemp}°F`, "pet-pill-neutral"));
  if (p.hotHum !== null && p.hotHum !== undefined)    parts.push(pill(`${p.hotHum}% RH (hot)`, "pet-pill-neutral"));
  if (p.coolHum !== null && p.coolHum !== undefined)  parts.push(pill(`${p.coolHum}% RH (cool)`, "pet-pill-neutral"));
  if (p.husbandry) parts.push(pill(`🏠 ${first8(p.husbandry)}`, "pet-pill-note"));
  if (p.health)    parts.push(pill(`⚕ ${first8(p.health)}`, "pet-pill-health"));
  return parts.length
    ? `<div class="pet-summary-pills">${parts.join("")}</div>`
    : `<div class="pet-last-log">no details</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
export function renderPets(data, container) {
  container.innerHTML = `
    <div class="section-title-row">
      <div class="card-label">🐾 mimic & pumpkin</div>
    </div>

    <!-- ── MIMIC ── -->
    <div class="pet-section">
      <div class="pet-header">
        <div class="pet-header-left">
          <span class="pet-emoji">🐶</span>
          <div>
            <div class="pet-header-name">mimic
              ${data.mimic ? `<span class="pet-entry-date">${fmtRelative(data.mimic.date)}</span>` : ""}
            </div>
            ${data.mimic ? mimicSummary(data.mimic) : `<div class="pet-last-log">no logs yet</div>`}
          </div>
        </div>
        <div class="pet-header-actions">
          <button class="fc-btn" id="mimic-history-btn">history</button>
          <button class="fc-btn fc-primary" id="mimic-toggle-btn">log today</button>
        </div>
      </div>

      <div class="pet-form" id="mimic-form">
        <div class="pet-form-grid">

          <div class="form-group" style="grid-column:1/3;">
            <label class="form-label">behavior</label>
            <div class="chip-select" data-field="mimic-behavior" data-type="multi">
              ${["snuggles cuddles","super good boy","played with friend","barked at dog","barked at human","barked while home","overly excited","whiney","jumpy bites","chased animal","pulled leash hard","potty accident"]
                .map(b => `<div class="select-chip" data-val="${b}">${b}</div>`).join("")}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">scheduled meds</label>
            <div class="chip-select" data-field="mimic-sched-meds" data-type="multi">
              ${["flea/tick/heartworm","prozac 10mg"]
                .map(m => `<div class="select-chip" data-val="${m}">${m}</div>`).join("")}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">PRN meds</label>
            <div class="chip-select" data-field="mimic-prn-meds" data-type="multi">
              ${["trazodone","gabapentin","clonidine"]
                .map(m => `<div class="select-chip" data-val="${m}">${m}</div>`).join("")}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">weight (lbs)</label>
            <input class="form-input" type="number" step="0.1" placeholder="lbs" id="mimic-weight"/>
          </div>

          <div class="form-group" style="grid-column:1/3;">
            <label class="form-label">training</label>
            <textarea class="form-input" rows="2" placeholder="Notes on training…" id="mimic-training"></textarea>
          </div>

          <div class="form-group" style="grid-column:1/3;">
            <label class="form-label">health comments</label>
            <textarea class="form-input" rows="2" placeholder="Health notes…" id="mimic-health"></textarea>
          </div>

        </div>
        <div class="pet-form-footer">
          <span class="pet-save-msg" id="mimic-save-msg"></span>
          <button class="fc-btn" id="mimic-cancel-btn">cancel</button>
          <button class="fc-btn fc-primary" id="mimic-save-btn">save entry</button>
        </div>
      </div>
    </div>

    <div class="shift-divider" style="margin:12px 0;"></div>

    <!-- ── PUMPKIN ── -->
    <div class="pet-section">
      <div class="pet-header">
        <div class="pet-header-left">
          <span class="pet-emoji">🐍</span>
          <div>
            <div class="pet-header-name">pumpkin
              ${data.pumpkin ? `<span class="pet-entry-date">${fmtRelative(data.pumpkin.date)}</span>` : ""}
            </div>
            ${data.pumpkin ? pumpkinSummary(data.pumpkin) : `<div class="pet-last-log">no logs yet</div>`}
          </div>
        </div>
        <div class="pet-header-actions">
          <button class="fc-btn" id="pumpkin-history-btn">history</button>
          <button class="fc-btn fc-primary" id="pumpkin-toggle-btn">log today</button>
        </div>
      </div>

      <div class="pet-form" id="pumpkin-form">
        <div class="pet-form-grid">

          <div class="form-group">
            <label class="form-label">feeding</label>
            <div class="chip-select" data-field="pumpkin-feeding" data-type="select">
              ${["success","strike miss","spit out","no strike","no interest"]
                .map(f => `<div class="select-chip" data-val="${f}">${f}</div>`).join("")}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">shed</label>
            <div class="chip-select" data-field="pumpkin-shed" data-type="select">
              ${["success","in blue","dirty","tail issue","eye cap issue"]
                .map(s => `<div class="select-chip" data-val="${s}">${s}</div>`).join("")}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">weight (g)</label>
            <input class="form-input" type="number" step="0.1" placeholder="g" id="pumpkin-weight"/>
          </div>

          <div class="form-group">
            <label class="form-label">hot zone temp (°F)</label>
            <input class="form-input" type="number" placeholder="°F" id="pumpkin-hot-temp"/>
          </div>

          <div class="form-group">
            <label class="form-label">cool zone temp (°F)</label>
            <input class="form-input" type="number" placeholder="°F" id="pumpkin-cool-temp"/>
          </div>

          <div class="form-group">
            <label class="form-label">hot zone humidity (%)</label>
            <input class="form-input" type="number" placeholder="%" id="pumpkin-hot-hum"/>
          </div>

          <div class="form-group">
            <label class="form-label">cool zone humidity (%)</label>
            <input class="form-input" type="number" placeholder="%" id="pumpkin-cool-hum"/>
          </div>

          <div class="form-group">
            <label class="form-label">husbandry change</label>
            <textarea class="form-input" rows="2" placeholder="Any changes…" id="pumpkin-husbandry"></textarea>
          </div>

          <div class="form-group" style="grid-column:1/3;">
            <label class="form-label">health comments</label>
            <textarea class="form-input" rows="2" placeholder="Health notes…" id="pumpkin-health"></textarea>
          </div>

        </div>
        <div class="pet-form-footer">
          <span class="pet-save-msg" id="pumpkin-save-msg"></span>
          <button class="fc-btn" id="pumpkin-cancel-btn">cancel</button>
          <button class="fc-btn fc-primary" id="pumpkin-save-btn">save entry</button>
        </div>
      </div>
    </div>
  `;

  wireChipSelects(container);
  wirePetForm(container, "mimic",   saveMimic);
  wirePetForm(container, "pumpkin", savePumpkin);

  document.getElementById("mimic-history-btn").addEventListener("click", () =>
    openPetHistory(IDS.mimic, "🐶 mimic", mapMimicPage, mimicSummary));
  document.getElementById("pumpkin-history-btn").addEventListener("click", () =>
    openPetHistory(IDS.pumpkin, "🐍 pumpkin", mapPumpkinPage, pumpkinSummary));
}

// ─────────────────────────────────────────────────────────────────────────────
// CHIP SELECT BEHAVIOUR
// ─────────────────────────────────────────────────────────────────────────────
function wireChipSelects(container) {
  container.querySelectorAll(".chip-select").forEach(group => {
    const isMulti = group.dataset.type === "multi";
    group.querySelectorAll(".select-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        if (isMulti) {
          chip.classList.toggle("selected");
        } else {
          group.querySelectorAll(".select-chip").forEach(c => c.classList.remove("selected"));
          chip.classList.add("selected");
        }
      });
    });
  });
}

function getSelected(container, field) {
  const group = container.querySelector(`[data-field="${field}"]`);
  if (!group) return [];
  return [...group.querySelectorAll(".select-chip.selected")].map(c => c.dataset.val);
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM WIRING
// ─────────────────────────────────────────────────────────────────────────────
function wirePetForm(container, pet, saveFn) {
  const toggleBtn = document.getElementById(`${pet}-toggle-btn`);
  const form      = document.getElementById(`${pet}-form`);
  const cancelBtn = document.getElementById(`${pet}-cancel-btn`);
  const saveBtn   = document.getElementById(`${pet}-save-btn`);
  const saveMsg   = document.getElementById(`${pet}-save-msg`);

  function openForm()  { form.classList.add("open");    toggleBtn.textContent = "cancel"; }
  function closeForm() { form.classList.remove("open"); toggleBtn.textContent = "log today"; saveMsg.textContent = ""; }

  toggleBtn.addEventListener("click", () => form.classList.contains("open") ? closeForm() : openForm());
  cancelBtn.addEventListener("click", closeForm);

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    saveMsg.textContent = "";
    try {
      await saveFn(container);
      saveMsg.style.color = "var(--moss-700)";
      saveMsg.textContent = "saved ✓";
      // Bust the cache so the reloaded card shows the new entry
      try { localStorage.removeItem("hub:cache:pets"); } catch {}
      setTimeout(async () => {
        closeForm();
        saveMsg.textContent = "";
        // Reload the whole card so the summary reflects the new entry
        const fresh = await loadPets();
        renderPets(fresh, container);
      }, 1400);
    } catch (err) {
      saveMsg.style.color = "var(--red-500)";
      saveMsg.textContent = `Failed: ${err.message}`;
      saveBtn.disabled = false;
      saveBtn.textContent = "save entry";
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTION CREATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function numOrNull(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) ? null : v;
}
function textVal(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function richText(str) {
  return str ? [{ text: { content: str } }] : [];
}

async function saveMimic(container) {
  const today = todayStr();
  const behavior    = getSelected(container, "mimic-behavior");
  const schedMeds   = getSelected(container, "mimic-sched-meds");
  const prnMeds     = getSelected(container, "mimic-prn-meds");
  const weight      = numOrNull("mimic-weight");
  const training    = textVal("mimic-training");
  const health      = textVal("mimic-health");

  const properties = {
    "title of day": { title: [{ text: { content: `Mimic · ${today}` } }] },
    "date":         { date: { start: today } },
    "behavior":     { multi_select: behavior.map(n => ({ name: n })) },
    "scheduled meds": { multi_select: schedMeds.map(n => ({ name: n })) },
    "PRN meds":     { multi_select: prnMeds.map(n => ({ name: n })) },
  };
  if (weight !== null)  properties["weight"]           = { number: weight };
  if (training)         properties["training"]         = { rich_text: richText(training) };
  if (health)           properties["health comments"]  = { rich_text: richText(health) };

  await api("create", IDS.mimic, { parent: { database_id: IDS.mimic }, properties });
}

async function savePumpkin(container) {
  const today = todayStr();
  const feedingSel = getSelected(container, "pumpkin-feeding");
  const shedSel    = getSelected(container, "pumpkin-shed");
  const weight     = numOrNull("pumpkin-weight");
  const hotTemp    = numOrNull("pumpkin-hot-temp");
  const coolTemp   = numOrNull("pumpkin-cool-temp");
  const hotHum     = numOrNull("pumpkin-hot-hum");
  const coolHum    = numOrNull("pumpkin-cool-hum");
  const husbandry  = textVal("pumpkin-husbandry");
  const health     = textVal("pumpkin-health");

  const properties = {
    "title of day": { title: [{ text: { content: `Pumpkin · ${today}` } }] },
    "date":         { date: { start: today } },
  };
  if (feedingSel[0])  properties["feeding"]              = { select: { name: feedingSel[0] } };
  if (shedSel[0])     properties["shed"]                 = { select: { name: shedSel[0] } };
  if (weight !== null)  properties["weight"]             = { number: weight };
  if (hotTemp !== null) properties["hot zone temp"]      = { number: hotTemp };
  if (coolTemp !== null) properties["cool zone temp"]    = { number: coolTemp };
  if (hotHum !== null)  properties["hot zone humidity"]  = { number: hotHum };
  if (coolHum !== null) properties["cool zone humidity"] = { number: coolHum };
  if (husbandry)      properties["husbandry change"]     = { rich_text: richText(husbandry) };
  if (health)         properties["health comments"]      = { rich_text: richText(health) };

  await api("create", IDS.pumpkin, { parent: { database_id: IDS.pumpkin }, properties });
}
