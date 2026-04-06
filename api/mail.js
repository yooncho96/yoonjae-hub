import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

const GMAIL_API   = "https://gmail.googleapis.com/gmail/v1/users/me";
const NOTION_API  = "https://api.notion.com/v1";
const NOTION_VER  = "2022-06-28";

// ── Direct Notion API helper (no proxy — server-side only) ─────────────────
async function notionReq(method, path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VER,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? res.json() : null;
}

function getNotionText(page, prop) {
  const p = page?.properties?.[prop];
  if (!p) return "";
  if (p.rich_text) return p.rich_text.map(t => t.plain_text).join("");
  if (p.title)     return p.title.map(t => t.plain_text).join("");
  if (p.url)       return p.url || "";
  return "";
}

// ── Ensure Notion DB has all required properties (runs once per cold start) ─
let schemaEnsured = false;
async function ensureMailCacheSchema(CACHE_DB) {
  if (schemaEnsured) return;
  try {
    const db = await notionReq("GET", `/databases/${CACHE_DB}`);
    if (!db?.properties) return;
    const existing = db.properties;
    const updates = {};

    // Rename title property to "Subject" if it has a different name
    const titleEntry = Object.entries(existing).find(([, v]) => v.type === "title");
    if (titleEntry && titleEntry[0] !== "Subject") {
      updates[titleEntry[0]] = { name: "Subject" };
    }

    // Add missing properties
    for (const name of ["From", "MessageID", "OsaMsgId", "Date", "Labels"]) {
      if (!existing[name]) updates[name] = { rich_text: {} };
    }
    if (!existing.MailLink) updates.MailLink = { url: {} };
    if (!existing.SyncedAt) updates.SyncedAt = { date: {} };

    if (Object.keys(updates).length > 0) {
      await notionReq("PATCH", `/databases/${CACHE_DB}`, { properties: updates });
    }
    schemaEnsured = true;
  } catch { /* non-fatal */ }
}

// ── Sync UT Austin emails → Notion cache ───────────────────────────────────
async function syncResearchToNotion(emails) {
  const CACHE_DB = process.env.NOTION_MAIL_CACHE_DB_ID;
  if (!CACHE_DB || !emails.length) return;
  await ensureMailCacheSchema(CACHE_DB);

  const existing = await notionReq("POST", `/databases/${CACHE_DB}/query`, { page_size: 100 });
  const byOsaId = {};
  for (const page of (existing?.results || [])) {
    const oid = getNotionText(page, "OsaMsgId");
    if (oid) byOsaId[oid] = page.id;
  }

  const freshIds = new Set(emails.map(e => e.osaMsgId).filter(Boolean));

  // Create new / update existing
  for (const email of emails) {
    const oid = email.osaMsgId;
    if (!oid) continue;
    // Parse email date → ISO YYYY-MM-DD for Notion date property
    const parsedDate = (() => {
      try { const d = new Date(email.date); return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0]; }
      catch { return null; }
    })();
    const props = {
      Subject:   { title:        [{ text: { content: email.title || "(no subject)" } }] },
      From:      { rich_text:    [{ text: { content: email.from  || "" } }] },
      MessageID: { rich_text:    [{ text: { content: oid } }] },
      OsaMsgId:  { rich_text:    [{ text: { content: oid } }] },
      Date:      parsedDate ? { date: { start: parsedDate } } : { date: null },
      MailLink:  { url: email.mailLink || null },
      Labels:    { multi_select: (email.labelIds || []).map(l => ({ name: l })) },
      SyncedAt:  { date: { start: new Date().toISOString() } },
    };
    if (byOsaId[oid]) {
      await notionReq("PATCH", `/pages/${byOsaId[oid]}`, { properties: {
        Labels:   props.Labels,
        SyncedAt: props.SyncedAt,
      }});
    } else {
      await notionReq("POST", "/pages", { parent: { database_id: CACHE_DB }, properties: props });
    }
  }

  // Archive stale entries (no longer unread/flagged in Mail)
  for (const [oid, pageId] of Object.entries(byOsaId)) {
    if (!freshIds.has(oid)) {
      await notionReq("PATCH", `/pages/${pageId}`, { archived: true });
    }
  }
}

// ── Read UT Austin emails from Notion cache ────────────────────────────────
async function fetchResearchFromNotion() {
  const CACHE_DB = process.env.NOTION_MAIL_CACHE_DB_ID;
  if (!CACHE_DB) return [];
  await ensureMailCacheSchema(CACHE_DB);
  const data = await notionReq("POST", `/databases/${CACHE_DB}/query`, {
    sorts: [{ property: "SyncedAt", direction: "descending" }],
    page_size: 30,
  });
  return (data?.results || []).map(page => {
    const oid    = getNotionText(page, "OsaMsgId");
    const labels = (page?.properties?.Labels?.multi_select || []).map(l => l.name);
    const date   = page?.properties?.Date?.date?.start || "";
    return {
      id:       `ut:${oid}`,
      type:     "email",
      account:  "research",
      title:    getNotionText(page, "Subject") || "(no subject)",
      from:     getNotionText(page, "From"),
      date,
      snippet:  "",
      mailLink: getNotionText(page, "MailLink"),
      labelIds: labels,
      osaMsgId: oid,
    };
  });
}

// ── Remove one entry from Notion cache ────────────────────────────────────
async function removeFromNotionCache(osaMsgId) {
  const CACHE_DB = process.env.NOTION_MAIL_CACHE_DB_ID;
  if (!CACHE_DB || !osaMsgId) return;
  const data = await notionReq("POST", `/databases/${CACHE_DB}/query`, {
    filter: { property: "OsaMsgId", rich_text: { equals: osaMsgId } },
    page_size: 1,
  });
  for (const page of (data?.results || [])) {
    await notionReq("PATCH", `/pages/${page.id}`, { archived: true });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

// ── Gmail OAuth token refresh ──────────────────────────────────────────────
async function getGmailToken() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

// ── Fetch personal Gmail emails ────────────────────────────────────────────
async function fetchGmailEmails(token) {
  const listRes = await fetch(
    `${GMAIL_API}/messages?q=is:unread%20OR%20is:starred&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return [];
  const { messages = [] } = await listRes.json();

  const details = await Promise.all(messages.map(async ({ id }) => {
    const r = await fetch(
      `${GMAIL_API}/messages/${id}?format=metadata` +
      `&metadataHeaders=Subject&metadataHeaders=From` +
      `&metadataHeaders=Date&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return r.ok ? r.json() : null;
  }));

  return details.filter(Boolean).map(msg => {
    const h = (name) => msg.payload?.headers?.find(h => h.name === name)?.value || "";
    const rawMsgId = h("Message-ID").replace(/^<|>$/g, "");
    return {
      id: msg.id,
      type: "email",
      account: "personal",
      title: h("Subject") || "(no subject)",
      from: h("From"),
      date: h("Date"),
      snippet: msg.snippet || "",
      mailLink: rawMsgId ? `message://%3C${rawMsgId}%3E` : null,
      labelIds: msg.labelIds || [],
    };
  });
}

// ── Gmail label mutations ──────────────────────────────────────────────────
async function modifyGmail(token, msgId, add = [], remove = []) {
  if (!token) return;
  await fetch(`${GMAIL_API}/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

// ── AppleScript for UT Austin (macOS localhost only) ──────────────────────
function buildOsaScript() {
  return `
set targetAccount to "yoonjae.cho@austin.utexas.edu"
set maxMessages to 30
set outputLines to {}

tell application "Mail"
  -- UNREAD
  set unreadMsgs to {}
  set allAccounts to every account
  repeat with acct in allAccounts
    if email addresses of acct contains targetAccount then
      set allMailboxes to every mailbox of acct
      repeat with mb in allMailboxes
        set mbName to name of mb
        if mbName is not in {"Sent", "Sent Items", "Deleted Items", "Trash", "Junk", "Junk Email", "Drafts"} then
          try
            set unreadInBox to (messages of mb whose read status is false)
            repeat with msg in unreadInBox
              set end of unreadMsgs to msg
            end repeat
          end try
        end if
      end repeat
    end if
  end repeat

  set cnt to 0
  repeat with msg in unreadMsgs
    if cnt >= maxMessages then exit repeat
    try
      set msgId to message id of msg
      set msgSubj to subject of msg
      set msgFrom to sender of msg
      set msgDate to date received of msg as string
      set msgBox to name of mailbox of msg
      set end of outputLines to "UNREAD" & tab & msgId & tab & msgSubj & tab & msgFrom & tab & msgDate & tab & msgBox
      set cnt to cnt + 1
    end try
  end repeat

  -- FLAGGED
  set flaggedMsgs to {}
  repeat with acct in allAccounts
    if email addresses of acct contains targetAccount then
      set allMailboxes to every mailbox of acct
      repeat with mb in allMailboxes
        set mbName to name of mb
        if mbName is not in {"Sent", "Sent Items", "Deleted Items", "Trash", "Junk", "Junk Email", "Drafts"} then
          try
            set flaggedInBox to (messages of mb whose flagged status is true)
            repeat with msg in flaggedInBox
              set end of flaggedMsgs to msg
            end repeat
          end try
        end if
      end repeat
    end if
  end repeat

  set cnt to 0
  repeat with msg in flaggedMsgs
    if cnt >= maxMessages then exit repeat
    try
      set msgId to message id of msg
      set msgSubj to subject of msg
      set msgFrom to sender of msg
      set msgDate to date received of msg as string
      set msgBox to name of mailbox of msg
      set end of outputLines to "FLAGGED" & tab & msgId & tab & msgSubj & tab & msgFrom & tab & msgDate & tab & msgBox
      set cnt to cnt + 1
    end try
  end repeat
end tell

set outText to ""
repeat with ln in outputLines
  set outText to outText & ln & linefeed
end repeat
return outText
`;
}

function fetchResearchEmails() {
  if (process.platform !== "darwin") return [];
  const tmpPath = "/tmp/hub_mail_triage.scpt";
  try {
    writeFileSync(tmpPath, buildOsaScript());
    const raw = execSync(`osascript "${tmpPath}"`, { timeout: 20000 }).toString();
    try { unlinkSync(tmpPath); } catch {}
    return parseOsaOutput(raw);
  } catch {
    try { unlinkSync(tmpPath); } catch {}
    return [];
  }
}

function parseOsaOutput(text) {
  const emails = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 6) continue;
    const [section, msgId, subject, from, date, mailbox] = parts.map(s => s.trim());
    if (!section || !msgId) continue;
    const uid = `ut:${msgId}`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    emails.push({
      id: uid,
      type: "email",
      account: "research",
      title: subject || "(no subject)",
      from: from || "",
      date: date || "",
      snippet: "",
      mailLink: `message://%3C${msgId}%3E`,
      labelIds: section === "FLAGGED" ? ["STARRED"] : ["UNREAD"],
      osaMsgId: msgId,
    });
  }
  return emails;
}

// ── AppleScript for actions (mark read / unflag on UT Austin) ─────────────
function runOsaAction(osaMsgId, action) {
  if (process.platform !== "darwin") return;
  const escaped = osaMsgId.replace(/"/g, '\\"');
  const setLine = action === "mark_unread"
    ? `set read status of msg to false`
    : action === "reflag"
      ? `set flagged status of msg to true`
      : action === "unflag"
        ? `set flagged status of msg to false`
        : `set read status of msg to true`;

  const script = `
tell application "Mail"
  set targetID to "${escaped}"
  set targetAccount to "yoonjae.cho@austin.utexas.edu"
  repeat with acct in every account
    if email addresses of acct contains targetAccount then
      repeat with mb in every mailbox of acct
        try
          repeat with msg in (messages of mb)
            if message id of msg is targetID then
              ${setLine}
              return
            end if
          end repeat
        end try
      end repeat
    end if
  end repeat
end tell
`;
  const tmpPath = "/tmp/hub_mail_action.scpt";
  try {
    writeFileSync(tmpPath, script);
    execSync(`osascript "${tmpPath}"`, { timeout: 10000 });
    try { unlinkSync(tmpPath); } catch {}
  } catch {
    try { unlinkSync(tmpPath); } catch {}
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET: fetch emails ──────────────────────────────────────────────────
  if (req.method === "GET") {
    if (req.query.op !== "fetch") return res.status(400).json({ error: "op=fetch required" });

    const token = await getGmailToken();
    const gmailEmails = token ? await fetchGmailEmails(token) : [];

    let researchEmails;
    if (process.platform === "darwin") {
      // Live fetch on Mac → sync to Notion cache (awaited so first refresh always populates)
      researchEmails = fetchResearchEmails();
      await syncResearchToNotion(researchEmails).catch(() => {});
    } else {
      // Non-Mac → read from Notion cache
      researchEmails = await fetchResearchFromNotion();
    }

    return res.status(200).json({
      emails: [...gmailEmails, ...researchEmails],
      gmailAvailable: !!token,
      researchAvailable: true,
    });
  }

  // ── POST: email action ─────────────────────────────────────────────────
  if (req.method === "POST") {
    let body = req.body;
    if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } else if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const { op, messageId, account, osaMsgId } = body || {};

    if (account === "personal") {
      const token = await getGmailToken();
      if (!token) return res.status(503).json({ error: "Gmail not configured" });
      if (op === "mark_read")   await modifyGmail(token, messageId, [], ["UNREAD"]);
      if (op === "mark_unread") await modifyGmail(token, messageId, ["UNREAD"], []);
      if (op === "unstar")      await modifyGmail(token, messageId, [], ["STARRED"]);
      if (op === "restar")      await modifyGmail(token, messageId, ["STARRED"], []);
    } else if (account === "research" && osaMsgId) {
      runOsaAction(osaMsgId, op);
      // Remove from Notion cache when dismissed (mark_read fires on done + abort)
      if (op === "mark_read") removeFromNotionCache(osaMsgId).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
