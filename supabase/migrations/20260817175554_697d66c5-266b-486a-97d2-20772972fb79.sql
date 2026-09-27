REVOKE EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated, service_role;