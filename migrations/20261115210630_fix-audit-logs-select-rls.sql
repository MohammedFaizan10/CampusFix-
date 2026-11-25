-- Allow service-role / edge functions (auth.uid() is null) and authenticated admins to select from account_audit_logs
DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.account_audit_logs;

CREATE POLICY "admin_read_audit_logs" ON public.account_audit_logs
  FOR SELECT TO anon, authenticated
  USING (auth.uid() IS NULL OR public.is_admin());
