const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN not configured on Vercel" });

  // All requests come in as POST with a JSON body describing the operation
  const { op, id, body: opBody } = req.body || {};
  if (!op) return res.status(400).json({ error: "op required" });

  try {
    let url, method = "GET", body;

    switch (op) {
      // Fetch a single page's metadata + properties
      case "page":
        url = `${NOTION_API}/pages/${id}`;
        break;

      // Fetch a page's block children (the actual content)
      case "blocks":
        url = `${NOTION_API}/blocks/${id}/children?page_size=100`;
        break;

      // Fetch nested blocks (for toggles, columns, etc.)
      case "block_children":
        url = `${NOTION_API}/blocks/${id}/children?page_size=100`;
        break;

      // Query a database with optional filters/sorts
      case "query":
        url = `${NOTION_API}/databases/${id}/query`;
        method = "POST";
        body = JSON.stringify({
          filter: opBody?.filter,
          sorts: opBody?.sorts,
          page_size: opBody?.page_size || 50,
        });
        break;

      // Create a new page in a database (the "add page" feature)
      case "create":
        url = `${NOTION_API}/pages`;
        method = "POST";
        body = JSON.stringify(opBody); // caller provides full Notion page payload
        break;

      default:
        return res.status(400).json({ error: `Unknown op: ${op}` });
    }

    const r = await fetch(url, {
      method,
      headers: headers(token),
      body: method === "POST" ? body : undefined,
    });

    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
