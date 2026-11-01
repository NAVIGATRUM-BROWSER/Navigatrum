/**
 * Self-contained dark-themed error page rendered inside the failing tab.
 * Ships as a data: URL so no resources or IPC are required to display it;
 * the "Try again" link simply navigates back to the original URL.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host || rawUrl
  } catch {
    return rawUrl
  }
}

export function buildErrorPageDataUrl(
  errorCode: number,
  errorDescription: string,
  failingUrl: string
): string {
  const host = escapeHtml(hostOf(failingUrl))
  const description = escapeHtml(errorDescription || 'ERR_FAILED')
  const retryHref = escapeHtml(failingUrl)

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    background: #0a0d16;
    color: #c7cbdc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: grid;
    place-items: center;
  }
  .card {
    max-width: 560px;
    width: 88%;
    text-align: center;
  }
  .needle {
    width: 56px;
    height: 56px;
    margin: 0 auto 22px;
    display: block;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    color: #eef0f8;
    letter-spacing: 0.01em;
    margin-bottom: 10px;
  }
  .host {
    background: linear-gradient(120deg, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  p { font-size: 14px; line-height: 1.6; color: #8b90a6; }
  code {
    display: inline-block;
    margin-top: 14px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
    color: #8b90a6;
    font-size: 12px;
  }
  a.retry {
    display: inline-block;
    margin-top: 26px;
    padding: 9px 22px;
    border-radius: 999px;
    border: 0;
    background: linear-gradient(120deg, #3b82f6, #8b5cf6);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
  }
  a.retry:hover { opacity: 0.92; }
  .hint { display: block; margin-top: 16px; font-size: 12px; color: #6b7087; }
</style>
</head>
<body>
  <div class="card">
    <svg class="needle" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="27" stroke="#3f465e" stroke-width="3"/>
      <path d="M32 9 L38 32 L32 55 L26 32 Z" fill="url(#g)"/>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#60a5fa"/>
          <stop offset="1" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
    </svg>
    <h1>Can't reach <span class="host">${host}</span></h1>
    <p>This page didn't load. The site may be unreachable or offline.</p>
    <code>${description} · error ${escapeHtml(String(errorCode))}</code>
    <br />
    <a class="retry" href="${retryHref}">Try again</a>
    <span class="hint">or press ⌘R</span>
  </div>
</body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}
