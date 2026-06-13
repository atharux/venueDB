// Cloudflare Pages Function — POST /api/create-checkout-session
//
// Creates a Stripe Checkout session for Pro (€49/mo) or Agency (€149/mo).
// Returns { url } — frontend redirects to this URL.
// After payment Stripe redirects to VITE_APP_URL/?stripe_session_id={CHECKOUT_SESSION_ID}

interface Env {
  STRIPE_SECRET_KEY: string
  STRIPE_PRICE_ID_PRO?: string
  STRIPE_PRICE_ID_AGENCY?: string
  VITE_APP_URL?: string
}

interface RequestBody {
  email?: unknown
  tier?: unknown
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get('Origin') ?? env.VITE_APP_URL ?? 'https://venuedb.pages.dev'

  const body = (await request.json().catch(() => null)) as RequestBody | null

  if (!body?.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 })
  }
  if (!body?.tier || !['pro', 'agency'].includes(body.tier as string)) {
    return Response.json({ error: 'tier must be "pro" or "agency"' }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()
  const tier = body.tier as 'pro' | 'agency'

  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const priceId = (tier === 'pro' ? env.STRIPE_PRICE_ID_PRO : env.STRIPE_PRICE_ID_AGENCY)

  if (!priceId) {
    return Response.json({ error: `Price ID for ${tier} not configured` }, { status: 503 })
  }

  const params = new URLSearchParams({
    'mode': 'subscription',
    'customer_email': email,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${origin}/`,
    'allow_promotion_codes': 'true',
    'billing_address_collection': 'auto',
    'tax_id_collection[enabled]': 'true',
  })

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!stripeRes.ok) {
    const err = await stripeRes.json().catch(() => ({ message: 'Stripe error' })) as { message?: string }
    return Response.json({ error: err.message ?? 'Stripe error' }, { status: 502 })
  }

  const session = await stripeRes.json() as { url: string }
  return Response.json({ url: session.url })
}
