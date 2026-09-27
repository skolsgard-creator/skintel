-- Steg 1: strama åt rättigheter (radnivån via RLS är oförändrad)

REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.spots FROM anon, authenticated;
REVOKE ALL ON public.scans FROM anon, authenticated;
REVOKE ALL ON public.lesion_reviews FROM anon, authenticated;
REVOKE ALL ON public.dermatologists FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.one_time_purchases FROM anon, authenticated;
REVOKE ALL ON public.organizations FROM anon, authenticated;
REVOKE ALL ON public.organization_members FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;

GRANT SELECT ON public.dermatologists TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.one_time_purchases TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT UPDATE ON public.organization_members TO authenticated;

-- lesion_reviews: endast icke-AI-kolumner läsbara för användaren
GRANT SELECT (
  id, user_id, spot_id, image_path, note, status,
  dermatologist_risk_level, dermatologist_verdict, assessed_skin_type,
  resulting_scan_id, created_at, reviewed_at,
  priority_tier, subscription_id, one_time_purchase_id
) ON public.lesion_reviews TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.spots TO service_role;
GRANT ALL ON public.scans TO service_role;
GRANT ALL ON public.lesion_reviews TO service_role;
GRANT ALL ON public.dermatologists TO service_role;
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.one_time_purchases TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;