// The base URL for all Notion API calls
const NOTION_API = "https://api.notion.com/v1";

// The version header Notion requires on every request
const NOTION_VERSION = "2022-06-28";

// Tell Vercel's runtime to parse incoming JSON request bodies automatically
export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
};

// The headers helper also needs to exist at module level
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

  const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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
