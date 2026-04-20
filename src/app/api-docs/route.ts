/**
 * GET /api-docs
 * Serves the Swagger UI page. Route handler bypasses Next.js layouts so the
 * full HTML document is returned directly.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luminescent Ledger — API Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #0B0E14; font-family: system-ui, sans-serif; }
    #back-link {
      display: inline-flex; align-items: center; gap: 6px;
      position: fixed; top: 16px; left: 16px; z-index: 9999;
      color: #BD9DFF; font-size: 13px; font-weight: 600;
      background: rgba(11,14,20,0.85); backdrop-filter: blur(8px);
      padding: 6px 12px; border-radius: 8px; text-decoration: none;
      border: 1px solid rgba(189,157,255,0.2);
    }
    #back-link:hover { background: rgba(189,157,255,0.1); }
    .swagger-ui { background: #0B0E14; color: #ECEDF6; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 60px 20px 24px; }
    .swagger-ui .info .title { color: #BD9DFF; font-size: 2rem; font-weight: 700; }
    .swagger-ui .info .description p,
    .swagger-ui .info .description code { color: #A9ABB3; }
    .swagger-ui .info a { color: #BD9DFF; }
    .swagger-ui .scheme-container {
      background: #10131A; padding: 16px 20px;
      border-bottom: 1px solid rgba(69,72,79,0.4);
    }
    .swagger-ui .opblock-tag { color: #ECEDF6; border-bottom-color: #45484F; font-size: 1.1rem; }
    .swagger-ui .opblock-tag:hover { background: rgba(189,157,255,0.05); }
    .swagger-ui section.models { background: #10131A; border-radius: 12px; margin: 0 20px 40px; }
    .swagger-ui .opblock { background: #161A21; border-radius: 10px; border: 1px solid #22262F; }
    .swagger-ui .opblock-summary { border-radius: 10px; }
    .swagger-ui .btn.authorize { border-color: #BD9DFF; color: #BD9DFF; }
    .swagger-ui .btn.authorize svg { fill: #BD9DFF; }
  </style>
</head>
<body>
  <a href="/developer" id="back-link">← Developer Portal</a>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.addEventListener('load', function () {
      SwaggerUIBundle({
        url: '/api/docs',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout',
        tryItOutEnabled: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1,
        filter: true,
      });
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
