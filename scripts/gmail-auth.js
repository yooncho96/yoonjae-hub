#!/usr/bin/env node
/**
 * One-time Gmail OAuth setup script.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → Library → Enable "Gmail API"
 *   3. APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID
 *      - Application type: Desktop app
 *      - Download the JSON → copy client_id and client_secret below
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.js
 *
 * After running, add the printed values to Vercel:
 *   vercel env add GMAIL_CLIENT_ID
 *   vercel env add GMAIL_CLIENT_SECRET
 *   vercel env add GMAIL_REFRESH_TOKEN
 */

import https from "https";
import http from "http";
import { URL } from "url";

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = "http://localhost:9876/oauth2callback";
const SCOPES        = "https://www.googleapis.com/auth/gmail.modify";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set as environment variables.");
  console.error("Usage: GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.js");
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n=== Gmail OAuth Setup ===\n");
console.log("Opening browser for authorization...");
console.log("If it doesn't open automatically, paste this URL:\n");
console.log(authUrl + "\n");

// Try to open the browser
try {
  const { execSync } = await import("child_process");
  execSync(`open "${authUrl}"`);
} catch {}

// Start local server to capture the callback
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:9876`);
  if (reqUrl.pathname !== "/oauth2callback") return;

  const code = reqUrl.searchParams.get("code");
  if (!code) {
    res.end("No code received.");
    server.close();
    return;
  }

  res.end("<html><body><h2>Authorization complete! You can close this tab.</h2></body></html>");
  server.close();

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    console.error("\nError: No refresh_token received. Try revoking access at");
    console.error("https://myaccount.google.com/permissions and running again.");
    process.exit(1);
  }

  console.log("\n=== SUCCESS ===\n");
  console.log("Add these to Vercel (run each command, paste value when prompted):\n");
  console.log(`  vercel env add GMAIL_CLIENT_ID`);
  console.log(`  → ${CLIENT_ID}\n`);
  console.log(`  vercel env add GMAIL_CLIENT_SECRET`);
  console.log(`  → ${CLIENT_SECRET}\n`);
  console.log(`  vercel env add GMAIL_REFRESH_TOKEN`);
  console.log(`  → ${tokens.refresh_token}\n`);
  console.log("Then redeploy: vercel --prod\n");
});

server.listen(9876, () => {
  console.log("Waiting for authorization callback on http://localhost:9876...");
});
