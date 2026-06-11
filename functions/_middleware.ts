export const onRequest = async (context) => {
  const host = context.request.headers.get('Host') || '';
// Before: blocks ALL requests to pages.dev
// After: blocks direct access but allows Worker proxy requests
if (request.headers.get('X-Worker-Proxy') !== 'atharux-gate') {
  return new Response('Not Found', { status: 404 });
}

  return context.next();
};
