-- Payment/subscription infrastructure (Way2Bill/Waytobill pilot). Locked pricing model:
--   Engångsanalys: 399 kr (one dermatologist-reviewed analysis)
--   Standard-prenumeration: 79 kr/mån + 349 kr/analys (rabatterat)
--   Premium-prenumeration: 149 kr/mån + 299 kr/analys (rabatterat), snabbare SLA + högre
--     granskningsprioritet
--   Free tier: tracking/history only -- never an unpaid or unreviewed analysis, see CLAUDE.md.
--
-- The Way2Bill API client itself is NOT wired up yet (paused pending sandbox portal access --
-- see CLAUDE.md). This migration only lays the ledger the submit-for-review gate
-- (src/lib/entitlements.ts) checks against once purchases/subscriptions start landing, e.g. via
-- a future webhook handler.

-- Recurring Autogiro subscriptions. A row here does not by itself mean "free analyses" --
-- subscribers still pay per analysis (at the discounted rate above); the subscription mainly
-- unlocks that discounted price and review priority. See lesion_reviews.priority_tier below.
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'premium')),
  status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled')),

  provider TEXT NOT NULL DEFAULT 'waytobill',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,

  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,

  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subscription read" ON public.subscriptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT (id, user_id, tier, status, current_period_end, created_at, canceled_at)
  ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- One row per attempted/completed one-time analysis purchase (399 kr standalone, or a
-- subscriber's discounted per-analysis price). A 'paid' row is consumed by exactly one
-- lesion_reviews row -- see lesion_reviews.one_time_purchase_id below -- after which its status
-- moves to 'consumed' so it can't fund a second submission.
CREATE TABLE public.one_time_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'consumed')),

  provider TEXT NOT NULL DEFAULT 'waytobill',
  provider_order_id TEXT,

  amount_ore INTEGER NOT NULL CHECK (amount_ore > 0),
  currency TEXT NOT NULL DEFAULT 'SEK',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,

  UNIQUE (provider, provider_order_id)
);

CREATE INDEX one_time_purchases_user_id_idx ON public.one_time_purchases(user_id);
CREATE INDEX one_time_purchases_status_idx ON public.one_time_purchases(status);

ALTER TABLE public.one_time_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own purchase read" ON public.one_time_purchases FOR SELECT TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT (id, user_id, status, amount_ore, currency, created_at, paid_at)
  ON public.one_time_purchases TO authenticated;
GRANT ALL ON public.one_time_purchases TO service_role;

-- Priority-queue prep for /granska (the sort itself lands in a later change, see CLAUDE.md) plus
-- an audit trail of which payment funded a given review case.
ALTER TABLE public.lesion_reviews
  ADD COLUMN priority_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (priority_tier IN ('none', 'standard', 'premium')),
  ADD COLUMN subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN one_time_purchase_id UUID REFERENCES public.one_time_purchases(id) ON DELETE SET NULL;

CREATE INDEX lesion_reviews_priority_tier_idx ON public.lesion_reviews(priority_tier);

GRANT SELECT (priority_tier, subscription_id, one_time_purchase_id)
  ON public.lesion_reviews TO authenticated;

COMMENT ON TABLE public.subscriptions IS
  'Recurring Way2Bill/Waytobill Autogiro subscriptions (standard/premium). Entitlement source for the submit-for-review gate, see src/lib/entitlements.ts.';
COMMENT ON TABLE public.one_time_purchases IS
  'Pay-per-analysis purchases (engångsköp): 399 kr standalone, or a subscriber''s discounted price. Entitlement source for the submit-for-review gate, see src/lib/entitlements.ts.';