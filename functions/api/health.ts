// Cloudflare Pages Function — GET /api/health
//
// Exists so the scraper status badge can confirm the server-side scraper is
// reachable in production. Mirrors the shape returned by the Vite middleware
// and the standalone local API server so the frontend can't tell them apart.

export const onRequestGet: PagesFunction = async () => {
  return Response.json({
    ok: true,
    mode: 'cloudflare-pages-function',
    hasSearch: true, // DuckDuckGo HTML fallback works server-side here too
    hasEnrich: true,
  })
}
