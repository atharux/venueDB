// Cloudflare Pages Function — POST /api/verify-session
//
// After Stripe redirects back to the app with ?stripe_session_id=xxx,
// the frontend calls this to confirm payment and get subscription details.
// Returns { email, tier, pro_until } on success.

interface Env {
  STRIPE_SECRET_KEY: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface StripeSession {
  id: string
  payment_status: string
  customer_email: string | null
  customer_details?: { email: string | null }
  metadata?: Record<string, string>
  subscription?: string
}

interface StripeSubscription {
  id: string
  status: string
  current_period_end: number
  items: { data: Array<{ price: { id: string; recurring?: { interval: string } } }> }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as { session_id?: unknown } | null

  if (!body?.session_id || typeof body.session_id !== 'string') {
    return Response.json({ error: 'session_id required' }, { status: 400 })
  }

  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const sessionRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${body.session_id}?expand[]=subscription`,
    { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
  )

  if (!sessionRes.ok) {
    return Response.json({ error: 'Invalid session' }, { status: 400 })
  }

  const session = await sessionRes.json() as StripeSession

  if (session.payment_status !== 'paid') {
    return Response.json({ error: 'Payment not completed' }, { status: 402 })
  }

  const email = session.customer_email ?? session.customer_details?.email ?? null
  if (!email) {
    return Response.json({ error: 'No email on session' }, { status: 400 })
  }

  const subscription = session.subscription as unknown as StripeSubscription | undefined
  const pro_until = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()

  // Determine tier from subscription price metadata (set in Stripe dashboard)
  const tier: 'pro' | 'agency' = (subscription?.metadata?.tier as 'pro' | 'agency') ?? 'pro'

  // Upsert into Supabase if configured (best-effort — webhook is the source of truth)
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        email,
        stripe_customer_id: typeof session.subscription === 'string' ? null : subscription?.id,
        stripe_subscription_id: subscription?.id ?? null,
        tier,
        status: 'active',
        pro_until,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => null)
  }

  return Response.json({ email, tier, pro_until })
}
