const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const notionHeaders = (token) => ({
  "Authorization": `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN not configured on Vercel" });

  let rawBody = req.body;
  if (!rawBody || (typeof rawBody === "object" && Object.keys(rawBody).length === 0)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    rawBody = JSON.parse(Buffer.concat(chunks).toString());
  } else if (typeof rawBody === "string") {
    rawBody = JSON.parse(rawBody);
  }
  const { op, id, body: opBody } = rawBody || {};
  if (!op) return res.status(400).json({ error: "op required" });

  try {
    let url, method = "GET", body;

    switch (op) {
      case "page":
        url = `${NOTION_API}/pages/${id}`;
        break;
      case "blocks":
        url = `${NOTION_API}/blocks/${id}/children?page_size=100`;
        break;
      case "block_children":
        url = `${NOTION_API}/blocks/${id}/children?page_size=100`;
        break;
      case "query":
        url = `${NOTION_API}/databases/${id}/query`;
        method = "POST";
        body = JSON.stringify({
          filter: opBody?.filter,
          sorts: opBody?.sorts,
          page_size: opBody?.page_size || 50,
        });
        break;
      case "create":
        url = `${NOTION_API}/pages`;
        method = "POST";
        body = JSON.stringify(opBody);
        break;
      case "update":
        url = `${NOTION_API}/pages/${id}`;
        method = "PATCH";
        body = JSON.stringify(opBody);
        break;
      default:
        return res.status(400).json({ error: `Unknown op: ${op}` });
    }

    const r = await fetch(url, {
      method,
      headers: notionHeaders(token),
      body: ["POST", "PATCH"].includes(method) ? body : undefined,
    });

    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
