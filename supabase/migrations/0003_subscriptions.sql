-- Subscriptions table — tracks Stripe billing state per email.
-- No Supabase Auth required; keyed by email (from Stripe checkout).

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email                   text UNIQUE NOT NULL,
  stripe_customer_id      text UNIQUE,
  stripe_subscription_id  text UNIQUE,
  tier                    text NOT NULL DEFAULT 'starter'
                            CHECK (tier IN ('starter', 'pro', 'agency')),
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  pro_until               timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON public.subscriptions (email);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx ON public.subscriptions (stripe_customer_id);

-- RLS: only service-role (webhook) can write; anon can read own row by email
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read own subscription"
  ON public.subscriptions FOR SELECT
  USING (true);

CREATE POLICY "service role full access"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role');
