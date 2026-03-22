import { api, IDS, nlink } from "./data.js";

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE REGISTRY
// Each entry defines:
//   - label: display name in the dropdown
//   - id: Notion database ID
//   - fields: the properties a user can fill in (beyond the title)
//   - titleProp: the name of the title property in that database
// ─────────────────────────────────────────────────────────────────────────────
const DATABASES = [
  {
    label: "🔥 Task Board",
    id: IDS.taskBoard,
    titleProp: "Name",
    fields: [
      { name: "Status",   type: "status", options: ["Not started", "In progress", "Done"], default: "Not started" },
      { name: "Priority", type: "select", options: ["Critical", "High", "Medium", "Low"] },
      { name: "Category", type: "select", options: ["WAVE", "Research", "Clinical", "Personal", "Financial", "Pet Care"] },
      { name: "Due Date", type: "date" },
      { name: "Notes",    type: "text" },
    ],
  },
  {
    label: "🧠 Psychiatry DB",
    id: IDS.psychiatryDb,
    titleProp: "Name",
    fields: [
      { name: "Category",    type: "select", options: ["assessment", "management", "disorders", "tips and pearls", "exams"] },
      { name: "Subcategory", type: "select", options: ["primary", "secondary", "medication", "maintenance", "psychotherapy", "interview", "SI/HI/AVH", "recognizing sx"] },
    ],
  },
  {
    label: "🌊 WAVE Tracker",
    id: IDS.waveTracker,
    titleProp: "Name",
    fields: [
      { name: "Component Area", type: "select", options: ["Frontend", "Backend", "Compliance", "Alerting", "Recruitment", "Finance"] },
      { name: "Status",         type: "select", options: ["Not started", "In progress", "Done", "Blocked"] },
      { name: "Next step",      type: "text" },
      { name: "Notes",          type: "text" },
    ],
  },
  {
    label: "🐾 Pet Care Log",
    id: IDS.petCareLog,
    titleProp: "Name",
    fields: [
      { name: "Pet",  type: "select", options: ["Mimic", "Pumpkin"] },
      { name: "Type", type: "select", options: ["Vet", "Feeding", "Shed", "Medication", "Grooming", "Note", "Husbandry"] },
      { name: "Notes", type: "text" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INIT — builds the modal DOM once and wires up all events
// ─────────────────────────────────────────────────────────────────────────────
let modal, modalOverlay, dbSelect, titleInput, fieldsContainer, submitBtn, statusMsg;

export function initAddForm(triggerBtn) {
  // Modal overlay (click to close)
  modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.addEventListener("click", closeForm);

  // Modal content
  modal = document.createElement("div");
  modal.className = "modal-panel";
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Add to Notion</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Database</label>
        <select class="form-select" id="add-db-select">
          ${DATABASES.map((db, i) => `<option value="${i}">${db.label}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Title <span class="form-required">*</span></label>
        <input class="form-input" id="add-title" type="text" placeholder="Page name…" autocomplete="off"/>
      </div>

      <div id="add-fields-container"></div>

      <div id="add-status-msg" class="add-status-msg"></div>

      <div class="modal-footer">
        <button class="btn-ghost" id="add-cancel">Cancel</button>
        <button class="btn-primary" id="add-submit">Add page</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);
  document.body.appendChild(modal);

  dbSelect       = document.getElementById("add-db-select");
  titleInput     = document.getElementById("add-title");
  fieldsContainer= document.getElementById("add-fields-container");
  submitBtn      = document.getElementById("add-submit");
  statusMsg      = document.getElementById("add-status-msg");

  document.getElementById("modal-close").addEventListener("click", closeForm);
  document.getElementById("add-cancel").addEventListener("click", closeForm);
  dbSelect.addEventListener("change", renderFields);
  submitBtn.addEventListener("click", handleSubmit);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeForm();
    if (e.key === "Enter" && modal.classList.contains("active")) handleSubmit();
  });

  triggerBtn.addEventListener("click", openForm);

  // Render initial fields
  renderFields();
}

function openForm() {
  modalOverlay.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
  titleInput.focus();
  statusMsg.textContent = "";
  statusMsg.className = "add-status-msg";
}

export function closeForm() {
  modalOverlay.classList.remove("active");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

// Re-render the dynamic property fields whenever the user picks a different database
function renderFields() {
  const db = DATABASES[parseInt(dbSelect.value)];
  fieldsContainer.innerHTML = db.fields.map(field => fieldHtml(field)).join("");
}

function fieldHtml(field) {
  const id = `add-field-${field.name.replace(/\s+/g, "-").toLowerCase()}`;
  let input;

  if (field.type === "select" || field.type === "status") {
    const opts = field.options.map(o =>
      `<option value="${o}" ${o === field.default ? "selected" : ""}>${o}</option>`
    ).join("");
    input = `<select class="form-select" id="${id}" data-field="${field.name}" data-type="${field.type}">
      <option value="">— none —</option>
      ${opts}
    </select>`;
  } else if (field.type === "date") {
    input = `<input class="form-input" type="date" id="${id}" data-field="${field.name}" data-type="date"/>`;
  } else {
    // text / rich_text
    input = `<input class="form-input" type="text" id="${id}" data-field="${field.name}" data-type="text" placeholder="Optional…"/>`;
  }

  return `<div class="form-group">
    <label class="form-label" for="${id}">${field.name}</label>
    ${input}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT — builds the Notion API payload and creates the page
// ─────────────────────────────────────────────────────────────────────────────
async function handleSubmit() {
  const db = DATABASES[parseInt(dbSelect.value)];
  const title = titleInput.value.trim();

  if (!title) {
    showStatus("Title is required.", "error");
    titleInput.focus();
    return;
  }

  // Collect dynamic field values
  const fieldEls = fieldsContainer.querySelectorAll("[data-field]");
  const extraProps = {};
  fieldEls.forEach(el => {
    const name = el.dataset.field;
    const type = el.dataset.type;
    const val  = el.value;
    if (!val) return;

    if (type === "select") {
      extraProps[name] = { select: { name: val } };
    } else if (type === "status") {
      extraProps[name] = { status: { name: val } };
    } else if (type === "date") {
      extraProps[name] = { date: { start: val } };
    } else {
      // rich_text
      extraProps[name] = { rich_text: [{ type: "text", text: { content: val } }] };
    }
  });

  // Build the full Notion page creation payload
  const payload = {
    parent: { database_id: db.id },
    properties: {
      [db.titleProp]: {
        title: [{ type: "text", text: { content: title } }],
      },
      ...extraProps,
    },
  };

  // Disable button and show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = "Adding…";
  showStatus("", "");

  try {
    const result = await api("create", null, payload);
    const newPageId = result.id;
    showStatus(
      `Created! <a href="${nlink(newPageId)}" target="_blank">Open in Notion ↗</a>`,
      "success"
    );
    // Reset form
    titleInput.value = "";
    fieldsContainer.querySelectorAll("select, input").forEach(el => {
      if (el.tagName === "SELECT") el.selectedIndex = 0;
      else el.value = "";
    });
    // Auto-close after short delay
    setTimeout(closeForm, 2000);
  } catch (err) {
    showStatus(`Failed: ${err.message}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add page";
  }
}

function showStatus(msg, type) {
  statusMsg.innerHTML = msg;
  statusMsg.className = `add-status-msg ${type ? "status-" + type : ""}`;
}
