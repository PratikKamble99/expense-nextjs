import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect to ChatGPT — Expense Tracker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 24px; background: #0d0f14; color: #e5e7eb; }
    h1 { font-size: 24px; margin-bottom: 6px; font-weight: 700; }
    p { color: #9ca3af; line-height: 1.6; margin-top: 6px; }
    .step { background: #13161e; border: 1px solid #1e2130; border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
    .step h3 { margin: 0 0 8px; font-size: 15px; color: #fff; font-weight: 600; }
    code { background: #1e2130; padding: 2px 8px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #a78bfa; }
    .url-box { background: #1e2130; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #6ee7b7; margin: 10px 0; word-break: break-all; white-space: pre-wrap; }
    a { color: #818cf8; }
    .badge { display: inline-block; background: #312e81; color: #a5b4fc; font-size: 11px; padding: 2px 10px; border-radius: 20px; margin-bottom: 10px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>💰 Connect to ChatGPT</h1>
  <p>Add your Expense Tracker as a ChatGPT Custom Action in 3 steps.</p>

  <div class="step">
    <span class="badge">Step 1</span>
    <h3>Generate an API Key</h3>
    <p>Go to <a href="${APP_URL}/settings">Settings → API Keys</a> and click <strong>Generate New Key</strong>. Copy it — it is shown only once.</p>
  </div>

  <div class="step">
    <span class="badge">Step 2</span>
    <h3>Add Custom Action in ChatGPT</h3>
    <p>Go to <strong>ChatGPT → Explore GPTs → Create → Configure → Add Action</strong></p>
    <p>Paste this manifest URL:</p>
    <div class="url-box">${APP_URL}/api/mcp/manifest</div>
    <p>In Authentication, select <strong>API Key</strong> → <strong>Bearer</strong> → paste your key.</p>
  </div>

  <div class="step">
    <span class="badge">Step 3</span>
    <h3>Test it</h3>
    <p>In ChatGPT, type: <code>"What's my account balance?"</code></p>
    <p style="margin-top:6px">Or: <code>"Add ₹450 food expense from my HDFC account"</code></p>
    <p style="margin-top:6px">Or share a receipt image and ask: <code>"Add this transaction"</code></p>
  </div>

  <div class="step">
    <span class="badge">Claude Desktop</span>
    <h3>Connecting Claude Desktop</h3>
    <p>Add to <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>:</p>
    <div class="url-box">{
  "mcpServers": {
    "expense-tracker": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${APP_URL}/api/mcp/sse"],
      "env": { "API_KEY": "your-key-here" }
    }
  }
}</div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
