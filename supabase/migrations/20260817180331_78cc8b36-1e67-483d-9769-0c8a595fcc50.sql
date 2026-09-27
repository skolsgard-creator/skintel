ALTER TABLE public.subscriptions
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.one_time_purchases
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.lesion_reviews
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX subscriptions_org_idx ON public.subscriptions (organization_id);
CREATE INDEX one_time_purchases_org_idx ON public.one_time_purchases (organization_id);
CREATE INDEX lesion_reviews_org_idx ON public.lesion_reviews (organization_id);

CREATE POLICY "hr admin reads org subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "hr admin reads org purchases"
  ON public.one_time_purchases FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id));